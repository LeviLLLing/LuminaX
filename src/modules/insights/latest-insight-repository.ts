import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InsightAction, InsightSnapshot } from "./insight-types";

interface LatestInsightRegistryFile {
  version: 1;
  insights: Record<string, InsightSnapshot>;
}

export interface LatestInsightRepository {
  findByUserId(userId: string): Promise<InsightSnapshot | null>;
  replaceForUser(snapshot: InsightSnapshot): Promise<InsightSnapshot>;
  updateActionState(
    userId: string,
    insightId: string,
    actionId: string,
    completed: boolean
  ): Promise<InsightSnapshot>;
}

export class InsightNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsightNotFoundError";
  }
}

export class InsightConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsightConflictError";
  }
}

export class InsightRepositoryCorruptError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InsightRepositoryCorruptError";
  }
}

export class FileLatestInsightRepository implements LatestInsightRepository {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath =
      process.env.LUMINAX_LATEST_INSIGHTS_PATH ||
      join(process.cwd(), ".luminax", "latest-insights.json")
  ) {}

  async findByUserId(userId: string): Promise<InsightSnapshot | null> {
    const snapshot = (await this.readRegistry()).insights[userId];
    return snapshot ? structuredClone(snapshot) : null;
  }

  async replaceForUser(snapshot: InsightSnapshot): Promise<InsightSnapshot> {
    return this.withWriteLock(async () => {
      const registry = await this.readRegistry();
      const existing = registry.insights[snapshot.userId];
      if (existing?.sourceFingerprint === snapshot.sourceFingerprint) {
        return structuredClone(existing);
      }

      registry.insights[snapshot.userId] = structuredClone(snapshot);
      await this.writeRegistry(registry);
      return structuredClone(snapshot);
    });
  }

  async updateActionState(
    userId: string,
    insightId: string,
    actionId: string,
    completed: boolean
  ): Promise<InsightSnapshot> {
    return this.withWriteLock(async () => {
      const registry = await this.readRegistry();
      const snapshot = registry.insights[userId];
      if (!snapshot) {
        throw new InsightNotFoundError(`No insight found for user ${userId}.`);
      }
      if (snapshot.id !== insightId) {
        throw new InsightConflictError(
          `Insight ${insightId} is not the latest insight for user ${userId}.`
        );
      }

      const action = snapshot.actions.find((item) => item.id === actionId);
      if (!action) {
        throw new InsightNotFoundError(
          `Action ${actionId} was not found in insight ${insightId}.`
        );
      }

      action.completed = completed;
      action.completedAt = completed ? new Date().toISOString() : null;
      snapshot.updatedAt = new Date().toISOString();
      await this.writeRegistry(registry);
      return structuredClone(snapshot);
    });
  }

  private async readRegistry(): Promise<LatestInsightRegistryFile> {
    let content: string;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, insights: {} };
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new InsightRepositoryCorruptError(
        "Latest insight repository contains invalid JSON.",
        { cause: error }
      );
    }

    if (!isLatestInsightRegistryFile(parsed)) {
      throw new InsightRepositoryCorruptError(
        "Latest insight repository has an invalid format."
      );
    }
    return parsed;
  }

  private async writeRegistry(registry: LatestInsightRegistryFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(registry, null, 2)}\n`,
      "utf8"
    );
    try {
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

function isLatestInsightRegistryFile(
  value: unknown
): value is LatestInsightRegistryFile {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.insights)) {
    return false;
  }
  return Object.entries(value.insights).every(
    ([userId, snapshot]) =>
      isInsightSnapshot(snapshot) && snapshot.userId === userId
  );
}

function isInsightSnapshot(value: unknown): value is InsightSnapshot {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.userId) &&
    isString(value.sourceQuestion) &&
    isString(value.sourceIntent) &&
    isRecord(value.scope) &&
    Array.isArray(value.scope.storeIds) &&
    value.scope.storeIds.every(isString) &&
    isString(value.scope.startDate) &&
    isString(value.scope.endDate) &&
    (value.scope.comparisonLabel === null ||
      isString(value.scope.comparisonLabel)) &&
    isString(value.headline) &&
    Array.isArray(value.findings) &&
    Array.isArray(value.evidence) &&
    Array.isArray(value.verificationItems) &&
    Array.isArray(value.actions) &&
    value.actions.every(isInsightAction) &&
    Array.isArray(value.accessRequirements) &&
    isString(value.sourceFingerprint) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isInsightAction(value: unknown): value is InsightAction {
  return (
    isRecord(value) &&
    isString(value.id) &&
    (value.priority === "P0" ||
      value.priority === "P1" ||
      value.priority === "P2") &&
    isString(value.title) &&
    isString(value.ownerRole) &&
    isString(value.verificationMetricCode) &&
    isString(value.verificationMetricLabel) &&
    typeof value.completed === "boolean" &&
    (value.completedAt === null || isString(value.completedAt))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
