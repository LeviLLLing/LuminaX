import type {
  InsightConfidence,
  InsightDraft,
  InsightSeverity,
} from "./insight-types";

export type InsightAttentionStatus = "risk" | "healthy" | "no_data";

export interface InsightAttentionCandidate {
  sourceId: string;
  subjectKey: string;
  role: "primary" | "support";
  score: number;
  severity: InsightSeverity;
  confidence: InsightConfidence;
  evidenceIds: string[];
}

export interface InsightActionContext {
  id: string;
  sourceId: string;
  subjectLabel: string;
  severity: InsightSeverity;
  mode: "improve" | "verify" | "monitor";
  verificationMetricCode: string;
}

export interface InsightAttentionPlan {
  status: InsightAttentionStatus;
  findings: InsightDraft["findings"];
  actionContexts: InsightActionContext[];
}

export interface InsightAttentionSelectionOptions {
  maxFindings: number;
  minFindings: number;
}

export function selectDiverseCandidates(
  candidates: InsightAttentionCandidate[],
  options: InsightAttentionSelectionOptions
): InsightAttentionCandidate[] {
  const maxFindings = Math.max(0, options.maxFindings);
  const sorted = [...candidates].sort((left, right) => {
    const scoreDifference = right.score - left.score;
    return scoreDifference !== 0
      ? scoreDifference
      : left.sourceId.localeCompare(right.sourceId);
  });
  const selected: InsightAttentionCandidate[] = [];
  const primarySubjects = new Set<string>();

  for (const candidate of sorted) {
    if (selected.length >= maxFindings) break;
    if (candidate.role !== "primary" || primarySubjects.has(candidate.subjectKey)) {
      continue;
    }
    selected.push(candidate);
    primarySubjects.add(candidate.subjectKey);
  }

  for (const candidate of sorted) {
    if (selected.length >= maxFindings) break;
    if (candidate.role === "support") selected.push(candidate);
  }

  return selected;
}
