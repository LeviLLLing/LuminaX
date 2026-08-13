import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InsightAction, InsightSnapshot } from "./insight-types";

export interface LatestInsightFileSystem {
  mkdir(path: string, options: { recursive: true }): Promise<string | undefined>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  rm(path: string, options: { force: true }): Promise<void>;
}

const defaultFileSystem: LatestInsightFileSystem = {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
};

const insightOwnerRoles = [
  "鍖哄煙缁忕悊",
  "搴楅暱",
  "杩愯惀",
  "璐㈠姟",
  "鏁版嵁鍒嗘瀽",
] as const;

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
      join(process.cwd(), ".luminax", "latest-insights.json"),
    private readonly fileSystem: LatestInsightFileSystem = defaultFileSystem
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
      content = await this.fileSystem.readFile(this.filePath, "utf8");
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
    await this.fileSystem.mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await this.fileSystem.writeFile(
      temporaryPath,
      `${JSON.stringify(registry, null, 2)}\n`,
      "utf8"
    );
    try {
      await this.fileSystem.rename(temporaryPath, this.filePath);
    } catch (renameError) {
      try {
        await this.fileSystem.rm(temporaryPath, { force: true });
      } catch (cleanupError) {
        if (renameError instanceof Error) {
          Object.defineProperty(renameError, "cleanupError", {
            configurable: true,
            value: cleanupError,
          });
        }
      }
      throw renameError;
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
    isInsightScope(value.scope) &&
    isString(value.headline) &&
    Array.isArray(value.findings) &&
    value.findings.every(isInsightFinding) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isInsightEvidence) &&
    Array.isArray(value.verificationItems) &&
    value.verificationItems.every(isInsightVerificationItem) &&
    Array.isArray(value.actions) &&
    value.actions.every(isInsightAction) &&
    Array.isArray(value.accessRequirements) &&
    value.accessRequirements.every(isDataAccessRequirement) &&
    isString(value.sourceFingerprint) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt)
  );
}

function isInsightScope(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStringArray(value.storeIds) &&
    isIsoDate(value.startDate) &&
    isIsoDate(value.endDate) &&
    (value.comparisonLabel === null || isString(value.comparisonLabel))
  );
}

function isInsightFinding(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.summary) &&
    isOneOf(value.severity, ["high", "medium", "low", "positive"]) &&
    isOneOf(value.confidence, ["high", "medium", "needs_verification"]) &&
    isStringArray(value.subjectIds) &&
    isString(value.metricCode) &&
    isFiniteNumber(value.value) &&
    isString(value.unit) &&
    isString(value.displayValue) &&
    isStringArray(value.evidenceIds)
  );
}

function isInsightEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isOneOf(value.type, [
      "store_target_variance",
      "period_variance",
      "anomaly_dates",
      "channel_contribution",
      "category_contribution",
      "daypart_contribution",
      "metric_drivers",
    ]) &&
    isString(value.title) &&
    isStringArray(value.supportsFindingIds) &&
    isString(value.unit) &&
    isString(value.baselineLabel) &&
    Array.isArray(value.series) &&
    value.series.every(isInsightEvidenceSeries) &&
    isString(value.interpretation)
  );
}

function isInsightEvidenceSeries(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.key) &&
    isString(value.label) &&
    isFiniteNumber(value.value) &&
    (value.baseline === undefined || isFiniteNumber(value.baseline)) &&
    isOneOf(value.direction, ["positive", "negative", "neutral"])
  );
}

function isInsightVerificationItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.observedFact) &&
    isString(value.hypothesis) &&
    isString(value.requiredCheck)
  );
}

function isInsightAction(value: unknown): value is InsightAction {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isOneOf(value.priority, ["P0", "P1", "P2"]) &&
    isString(value.title) &&
    isOneOf(value.ownerRole, insightOwnerRoles) &&
    isString(value.verificationMetricCode) &&
    isString(value.verificationMetricLabel) &&
    typeof value.completed === "boolean" &&
    (value.completedAt === null || isIsoTimestamp(value.completedAt))
  );
}

function isDataAccessRequirement(value: unknown): boolean {
  return (
    isRecord(value) && isString(value.tableName) && isStringArray(value.columns)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOneOf<T extends string>(
  value: unknown,
  values: readonly T[]
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isIsoDate(value: unknown): value is string {
  if (!isString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isIsoTimestamp(value: unknown): value is string {
  if (!isString(value)) return false;
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.valueOf()) && timestamp.toISOString() === value
  );
}
