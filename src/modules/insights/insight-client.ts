import type {
  InsightAction,
  InsightConfidence,
  InsightEvidence,
  InsightEvidenceSeries,
  InsightEvidenceType,
  InsightFinding,
  InsightOwnerRole,
  InsightScope,
  InsightSeverity,
  InsightSnapshotDto,
  InsightVerificationItem,
} from "./insight-types";

const SEVERITIES: readonly InsightSeverity[] = ["high", "medium", "low", "positive"];
const CONFIDENCES: readonly InsightConfidence[] = ["high", "medium", "needs_verification"];
const EVIDENCE_TYPES: readonly InsightEvidenceType[] = [
  "store_target_variance",
  "period_variance",
  "anomaly_dates",
  "channel_contribution",
  "category_contribution",
  "daypart_contribution",
  "metric_drivers",
];
const OWNER_ROLES: readonly InsightOwnerRole[] = [
  "区域经理",
  "店长",
  "运营",
  "财务",
  "数据分析",
];

export class InsightClientError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "InsightClientError";
  }
}

export async function fetchLatestInsight(): Promise<InsightSnapshotDto | null> {
  const response = await fetch("/api/insights/latest", { cache: "no-store" });
  if (response.status === 401) redirectToLogin();
  const body = await readResponse(response);
  if (!response.ok) throw responseError(response.status, body, "Latest insight unavailable");
  if (!isRecord(body) || !("insight" in body)) throw invalidDto();
  return body.insight === null ? null : normalizeInsightSnapshotDto(body.insight);
}

export interface UpdateLatestInsightActionInput {
  insightId: string;
  actionId: string;
  completed: boolean;
}

export async function updateLatestInsightAction({
  insightId,
  actionId,
  completed,
}: UpdateLatestInsightActionInput): Promise<InsightSnapshotDto> {
  const response = await fetch(
    `/api/insights/latest/actions/${encodeURIComponent(actionId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insightId, completed }),
    }
  );
  if (response.status === 401) redirectToLogin();
  const body = await readResponse(response);
  if (!response.ok) throw responseError(response.status, body, "Insight action update failed");
  if (!isRecord(body) || !("insight" in body)) throw invalidDto();
  return normalizeInsightSnapshotDto(body.insight);
}

export function normalizeInsightSnapshotDto(value: unknown): InsightSnapshotDto {
  const record = recordOf(value);
  const findings = arrayOf(record.findings, normalizeFinding);
  const evidence = arrayOf(record.evidence, normalizeEvidence);
  const verificationItems = arrayOf(record.verificationItems, normalizeVerificationItem);
  const actions = arrayOf(record.actions, normalizeAction);
  const findingIds = uniqueIds(findings);
  const evidenceIds = uniqueIds(evidence);
  uniqueIds(verificationItems);
  uniqueIds(actions);

  for (const finding of findings) {
    if (finding.evidenceIds.some((id) => !evidenceIds.has(id))) throw invalidDto();
  }
  for (const item of evidence) {
    if (item.supportsFindingIds.some((id) => !findingIds.has(id))) throw invalidDto();
  }

  return {
    id: stringOf(record.id),
    sourceQuestion: stringOf(record.sourceQuestion),
    sourceIntent: stringOf(record.sourceIntent),
    scope: normalizeScope(record.scope),
    headline: stringOf(record.headline),
    findings,
    evidence,
    verificationItems,
    actions,
    createdAt: timestampOf(record.createdAt),
    updatedAt: timestampOf(record.updatedAt),
  };
}

function normalizeScope(value: unknown): InsightScope {
  const record = recordOf(value);
  const storeIds = uniqueStringArrayOf(record.storeIds);
  const startDate = dateOf(record.startDate);
  const endDate = dateOf(record.endDate);
  if (startDate > endDate) throw invalidDto();
  return {
    storeIds,
    startDate,
    endDate,
    comparisonLabel: record.comparisonLabel === null ? null : stringOf(record.comparisonLabel),
  };
}

function normalizeFinding(value: unknown): InsightFinding {
  const record = recordOf(value);
  return {
    id: stringOf(record.id),
    title: stringOf(record.title),
    summary: stringOf(record.summary),
    severity: enumOf(record.severity, SEVERITIES),
    confidence: enumOf(record.confidence, CONFIDENCES),
    subjectIds: uniqueStringArrayOf(record.subjectIds),
    metricCode: stringOf(record.metricCode),
    value: numberOf(record.value),
    unit: stringOf(record.unit),
    displayValue: stringOf(record.displayValue),
    evidenceIds: uniqueStringArrayOf(record.evidenceIds),
  };
}

function normalizeEvidence(value: unknown): InsightEvidence {
  const record = recordOf(value);
  const series = arrayOf(record.series, normalizeEvidenceSeries);
  uniqueIds(series.map((item) => ({ id: item.key })));
  return {
    id: stringOf(record.id),
    type: enumOf(record.type, EVIDENCE_TYPES),
    title: stringOf(record.title),
    supportsFindingIds: uniqueStringArrayOf(record.supportsFindingIds),
    unit: stringOf(record.unit),
    baselineLabel: stringOf(record.baselineLabel),
    series,
    interpretation: stringOf(record.interpretation),
  };
}

function normalizeEvidenceSeries(value: unknown): InsightEvidenceSeries {
  const record = recordOf(value);
  return {
    key: stringOf(record.key),
    label: stringOf(record.label),
    value: numberOf(record.value),
    ...(record.baseline === undefined ? {} : { baseline: numberOf(record.baseline) }),
    direction: enumOf(record.direction, ["positive", "negative", "neutral"] as const),
  };
}

function normalizeVerificationItem(value: unknown): InsightVerificationItem {
  const record = recordOf(value);
  return {
    id: stringOf(record.id),
    observedFact: stringOf(record.observedFact),
    hypothesis: stringOf(record.hypothesis),
    requiredCheck: stringOf(record.requiredCheck),
  };
}

function normalizeAction(value: unknown): InsightAction {
  const record = recordOf(value);
  const completedAt = record.completedAt;
  const completed = booleanOf(record.completed);
  const normalizedCompletedAt = completedAt === null ? null : timestampOf(completedAt);
  if (completed !== (normalizedCompletedAt !== null)) throw invalidDto();
  return {
    id: stringOf(record.id),
    priority: enumOf(record.priority, ["P0", "P1", "P2"] as const),
    title: stringOf(record.title),
    ownerRole: enumOf(record.ownerRole, OWNER_ROLES),
    verificationMetricCode: stringOf(record.verificationMetricCode),
    verificationMetricLabel: stringOf(record.verificationMetricLabel),
    completed,
    completedAt: normalizedCompletedAt,
  };
}

async function readResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseError(status: number, body: unknown, fallback: string): InsightClientError {
  const message = isRecord(body) && typeof body.error === "string" && body.error.trim()
    ? body.error.trim()
    : fallback;
  return new InsightClientError(status, message);
}

function redirectToLogin(): void {
  if (typeof window !== "undefined") window.location.replace("/login?next=/");
}

function invalidDto(): InsightClientError {
  return new InsightClientError(500, "Latest insight response is invalid");
}

function recordOf(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw invalidDto();
  return value;
}

function stringOf(value: unknown): string {
  if (typeof value !== "string") throw invalidDto();
  return value;
}

function stringArrayOf(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw invalidDto();
  return [...value];
}

function uniqueStringArrayOf(value: unknown): string[] {
  const items = stringArrayOf(value);
  if (new Set(items).size !== items.length) throw invalidDto();
  return items;
}

function numberOf(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalidDto();
  return value;
}

function booleanOf(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalidDto();
  return value;
}

function dateOf(value: unknown): string {
  const date = stringOf(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw invalidDto();
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw invalidDto();
  return date;
}

function timestampOf(value: unknown): string {
  const timestamp = stringOf(value);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== timestamp) throw invalidDto();
  return timestamp;
}

function enumOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw invalidDto();
  return value as T;
}

function arrayOf<T>(value: unknown, normalize: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw invalidDto();
  return value.map(normalize);
}

function uniqueIds(items: Array<{ id: string }>): Set<string> {
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw invalidDto();
  return ids;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
