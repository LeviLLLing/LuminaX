import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { InsightGenerationToken } from "./insight-generation-guard";
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
  "区域经理",
  "店长",
  "运营",
  "财务",
  "数据分析",
] as const;

interface LatestInsightRegistryFile {
  version: 1;
  insights: Record<string, InsightSnapshot>;
  generations: Record<string, InsightGenerationToken>;
}

const sharedWriteQueues = new Map<string, Promise<unknown>>();
const LOCK_RETRY_MS = 10;
const LOCK_TIMEOUT_MS = 5_000;
const STALE_LOCK_MS = 30_000;

export interface LatestInsightRepository {
  findByUserId(userId: string): Promise<InsightSnapshot | null>;
  claimGeneration(token: InsightGenerationToken): Promise<boolean>;
  replaceForUser(
    snapshot: InsightSnapshot,
    token?: InsightGenerationToken
  ): Promise<InsightSnapshot>;
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

export class InsightConditionalWriteError extends Error {
  constructor() {
    super("The insight was superseded before it could be committed.");
    this.name = "InsightConditionalWriteError";
  }
}

export class InsightRepositoryCorruptError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InsightRepositoryCorruptError";
  }
}

export class FileLatestInsightRepository implements LatestInsightRepository {
  constructor(
    private readonly filePath =
      process.env.LUMINAX_LATEST_INSIGHTS_PATH ||
      join(process.cwd(), ".luminax", "latest-insights.json"),
    private readonly fileSystem: LatestInsightFileSystem = defaultFileSystem
  ) {}

  async findByUserId(userId: string): Promise<InsightSnapshot | null> {
    await (sharedWriteQueues.get(resolve(this.filePath)) || Promise.resolve()).catch(
      () => undefined
    );
    const snapshot = (await this.readRegistry()).insights[userId];
    return snapshot ? structuredClone(snapshot) : null;
  }

  async claimGeneration(token: InsightGenerationToken): Promise<boolean> {
    return this.withWriteLock(async () => {
      const registry = await this.readRegistry();
      const current = registry.generations[token.userId];
      if (current && compareGenerationTokens(token, current) < 0) return false;
      if (current && sameGenerationToken(token, current)) return true;
      registry.generations[token.userId] = structuredClone(token);
      await this.writeRegistry(registry);
      return true;
    });
  }

  async replaceForUser(
    snapshot: InsightSnapshot,
    token?: InsightGenerationToken
  ): Promise<InsightSnapshot> {
    return this.withWriteLock(async () => {
      const registry = await this.readRegistry();
      if (
        token &&
        (token.userId !== snapshot.userId ||
          !sameGenerationToken(token, registry.generations[token.userId]))
      ) {
        throw new InsightConditionalWriteError();
      }
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
        return { version: 1, insights: {}, generations: {} };
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
    return {
      ...parsed,
      generations: parsed.generations || {},
    };
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
          try {
            Object.defineProperty(renameError, "cleanupError", {
              configurable: true,
              value: cleanupError,
            });
          } catch {
            // Cleanup metadata must never replace the original rename failure.
          }
        }
      }
      throw renameError;
    }
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const key = resolve(this.filePath);
    const previous = sharedWriteQueues.get(key) || Promise.resolve();
    const result = previous.then(
      () => withFileLock(key, operation),
      () => withFileLock(key, operation)
    );
    const settled = result.then(
      () => undefined,
      () => undefined
    );
    sharedWriteQueues.set(key, settled);
    void settled.then(() => {
      if (sharedWriteQueues.get(key) === settled) sharedWriteQueues.delete(key);
    });
    return result;
  }
}

async function withFileLock<T>(
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
  await mkdir(dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  const owner = `${process.pid}:${randomUUID()}`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  let handle: FileHandle | undefined;
  while (!handle) {
    try {
      const candidate = await open(lockPath, "wx");
      try {
        await candidate.writeFile(owner, "utf8");
        handle = candidate;
      } catch (error) {
        await candidate.close().catch(() => undefined);
        await rm(lockPath, { force: true }).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const lockStats = await stat(lockPath);
        if (Date.now() - lockStats.mtimeMs > STALE_LOCK_MS) {
          await rm(lockPath, { force: true });
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== "ENOENT") throw statError;
      }
      if (Date.now() >= deadline) {
        throw new Error("Timed out waiting for the latest insight repository lock.");
      }
      await delay(LOCK_RETRY_MS);
    }
  }

  let operationFailed = false;
  let operationError: unknown;
  let result: T | undefined;
  try {
    result = await operation();
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }
  const cleanupError = await releaseFileLock(handle, lockPath, owner);
  if (operationFailed) {
    attachCleanupError(operationError, cleanupError);
    throw operationError;
  }
  if (cleanupError) throw cleanupError;
  return result as T;
}

async function releaseFileLock(
  handle: FileHandle,
  lockPath: string,
  owner: string
): Promise<unknown | null> {
  try {
    await handle.close();
    const currentOwner = await readFile(lockPath, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    });
    if (currentOwner === owner) await rm(lockPath, { force: true });
    return null;
  } catch (error) {
    return error;
  }
}

function attachCleanupError(error: unknown, cleanupError: unknown | null): void {
  if (!(error instanceof Error) || !cleanupError) return;
  try {
    Object.defineProperty(error, "lockCleanupError", {
      configurable: true,
      value: cleanupError,
    });
  } catch {
    // Lock cleanup metadata must never replace the original operation failure.
  }
}

function isLatestInsightRegistryFile(
  value: unknown
): value is LatestInsightRegistryFile {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRecord(value.insights) ||
    (value.generations !== undefined && !isRecord(value.generations))
  ) {
    return false;
  }
  return Object.entries(value.insights).every(
    ([userId, snapshot]) =>
      isInsightSnapshot(snapshot) && snapshot.userId === userId
  ) && Object.entries(value.generations || {}).every(
    ([userId, token]) => isGenerationToken(token) && token.userId === userId
  );
}

function isGenerationToken(value: unknown): value is InsightGenerationToken {
  return isRecord(value) &&
    isString(value.userId) && value.userId.trim().length > 0 &&
    isString(value.requestId) && value.requestId.trim().length > 0 &&
    typeof value.startedAt === "number" &&
    Number.isFinite(value.startedAt);
}

function sameGenerationToken(
  left: InsightGenerationToken,
  right: InsightGenerationToken | undefined
): boolean {
  return Boolean(
    right &&
      left.userId === right.userId &&
      left.requestId === right.requestId &&
      left.startedAt === right.startedAt
  );
}

function compareGenerationTokens(
  left: InsightGenerationToken,
  right: InsightGenerationToken
): number {
  return left.startedAt - right.startedAt || left.requestId.localeCompare(right.requestId);
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
