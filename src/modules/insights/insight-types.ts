import type { DataAccessRequirement } from "@/modules/admin/permissions/permission-types";

export type InsightSeverity = "high" | "medium" | "low" | "positive";
export type InsightConfidence = "high" | "medium" | "needs_verification";
export type InsightEvidenceType =
  | "store_target_variance"
  | "period_variance"
  | "anomaly_dates"
  | "channel_contribution"
  | "category_contribution"
  | "daypart_contribution"
  | "metric_drivers";
export type InsightOwnerRole =
  | "区域经理"
  | "店长"
  | "运营"
  | "财务"
  | "数据分析";

export interface InsightScope {
  storeIds: string[];
  startDate: string;
  endDate: string;
  comparisonLabel: string | null;
}

export interface InsightFinding {
  id: string;
  title: string;
  summary: string;
  severity: InsightSeverity;
  confidence: InsightConfidence;
  subjectIds: string[];
  metricCode: string;
  value: number;
  unit: string;
  displayValue: string;
  evidenceIds: string[];
}

export interface InsightEvidenceSeries {
  key: string;
  label: string;
  value: number;
  baseline?: number;
  direction: "positive" | "negative" | "neutral";
}

export interface InsightEvidence {
  id: string;
  type: InsightEvidenceType;
  title: string;
  supportsFindingIds: string[];
  unit: string;
  baselineLabel: string;
  series: InsightEvidenceSeries[];
  interpretation: string;
}

export interface InsightVerificationItem {
  id: string;
  observedFact: string;
  hypothesis: string;
  requiredCheck: string;
}

export interface InsightAction {
  id: string;
  priority: "P0" | "P1" | "P2";
  title: string;
  ownerRole: InsightOwnerRole;
  verificationMetricCode: string;
  verificationMetricLabel: string;
  completed: boolean;
  completedAt: string | null;
}

export interface InsightSnapshot {
  id: string;
  userId: string;
  sourceQuestion: string;
  sourceIntent: string;
  scope: InsightScope;
  headline: string;
  findings: InsightFinding[];
  evidence: InsightEvidence[];
  verificationItems: InsightVerificationItem[];
  actions: InsightAction[];
  accessRequirements: DataAccessRequirement[];
  sourceFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export type InsightSnapshotDto = Omit<
  InsightSnapshot,
  "userId" | "accessRequirements" | "sourceFingerprint"
>;

export type InsightStreamEvent =
  | { status: "generating" }
  | { status: "updated"; insightId: string; findingCount: number; actionCount: number }
  | { status: "failed" };

export interface InsightDraft {
  findings: Array<{
    sourceId: string;
    severity: InsightSeverity;
    confidence: InsightConfidence;
    evidenceIds: string[];
  }>;
  verificationItems: Array<{
    sourceId: string;
    hypothesis: string;
    requiredCheck: string;
  }>;
  actions: Array<{
    priority: "P0" | "P1" | "P2";
    title: string;
    ownerRole: InsightOwnerRole;
    verificationMetricCode: string;
  }>;
}

export function toInsightSnapshotDto(snapshot: InsightSnapshot): InsightSnapshotDto {
  const { userId: _userId, accessRequirements: _accessRequirements, sourceFingerprint: _sourceFingerprint, ...clientFields } = snapshot;
  return structuredClone(clientFields);
}
