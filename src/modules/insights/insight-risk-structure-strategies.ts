import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import {
  selectDiverseCandidates,
  type InsightActionContext,
  type InsightAttentionCandidate,
  type InsightAttentionPlan,
} from "./insight-attention-plan";
import type { InsightSeverity } from "./insight-types";
import type { InsightAttentionStrategy } from "./insight-performance-strategies";
import type {
  InsightFindingSource,
  InsightSourceCatalog,
} from "./insight-source-catalog";

export const riskStructureAttentionStrategies: Partial<
  Record<AnalysisIntent, InsightAttentionStrategy>
> = {
  refund_rate: { build: buildRefundPlan },
  anomaly_detection: { build: buildAnomalyPlan },
  channel_mix: { build: (catalog) => buildStructurePlan(catalog, "channel_pct") },
  daypart_analysis: { build: (catalog) => buildStructurePlan(catalog, "daypart_pct") },
  promotion_contribution: { build: buildPromotionPlan },
};

function buildRefundPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const overallRate = catalog.findingSources.find((source) => source.metricCode === "refund_rate" && source.attention.subjectKey === "scope")?.value;
  const sources = catalog.findingSources.filter((source) => {
    return source.metricCode === "store_refund_rate" || source.metricCode === "daily_refund_rate";
  });
  const assessedSources = sources.length > 0
    ? sources
    : catalog.findingSources.filter((source) => source.metricCode === "refund_rate");
  const candidates = assessedSources.map((source) => {
    const severity = refundSeverity(source.value, overallRate, source.attention.subjectKey === "scope");
    return candidate(source, severity, refundScore(source.value, overallRate, severity));
  });

  return buildPlan(catalog, candidates);
}

function buildAnomalyPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const candidates = catalog.findingSources
    .filter((source) => source.metricCode === "anomaly_count")
    .map((source) => {
      const severity = anomalySeverity(source.value);
      return candidate(source, severity, anomalyScore(catalog, source, severity));
    });

  return buildPlan(catalog, candidates);
}

function buildPromotionPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const storeContributions = catalog.findingSources.filter((source) => source.metricCode === "store_contribution_rate");
  const sources = storeContributions.length > 0
    ? storeContributions
    : catalog.findingSources.filter((source) => source.metricCode === "contribution_rate");
  return buildStructurePlan(catalog, sources);
}

function buildStructurePlan(
  catalog: InsightSourceCatalog,
  metricCodeOrSources: string | InsightFindingSource[]
): InsightAttentionPlan {
  const sources = typeof metricCodeOrSources === "string"
    ? catalog.findingSources.filter((source) => source.metricCode === metricCodeOrSources)
    : metricCodeOrSources;
  const candidates = sources.map((source) => {
    return candidate(source, "low", 1_000_000 + Math.abs(source.value), "needs_verification");
  });
  const selected = selectDiverseCandidates(candidates, { maxFindings: 3, minFindings: 1 });

  return {
    status: selected.length > 0 ? "healthy" : "no_data",
    findings: selected.map(toFinding),
    actionContexts: actionContexts(catalog, selected, "verify"),
  };
}

function buildPlan(
  catalog: InsightSourceCatalog,
  candidates: InsightAttentionCandidate[]
): InsightAttentionPlan {
  if (candidates.length === 0) return { status: "no_data", findings: [], actionContexts: [] };

  const risks = candidates.filter((item) => item.severity === "high" || item.severity === "medium");
  const selected = selectDiverseCandidates(risks.length > 0 ? risks : candidates, {
    maxFindings: risks.length > 0 ? 5 : 3,
    minFindings: 1,
  });
  const mode = risks.length > 0 ? "improve" : "monitor";

  return {
    status: risks.length > 0 ? "risk" : "healthy",
    findings: selected.map(toFinding),
    actionContexts: actionContexts(catalog, selected, mode),
  };
}

function refundSeverity(rate: number, overallRate: number | undefined, isOverall: boolean): InsightSeverity {
  if (rate > 2) return "high";
  if (!isOverall && overallRate !== undefined && rate - overallRate >= 0.5) return "medium";
  return rate <= (overallRate ?? rate) ? "positive" : "low";
}

function anomalySeverity(count: number): InsightSeverity {
  if (count >= 2) return "high";
  if (count === 1) return "medium";
  return "positive";
}

function refundScore(rate: number, overallRate: number | undefined, severity: InsightSeverity): number {
  const weight = severity === "high" ? 3_000_000 : severity === "medium" ? 2_000_000 : 1_000_000;
  return weight + (severity === "positive" ? -rate : rate - (overallRate ?? 0));
}

function anomalyScore(
  catalog: InsightSourceCatalog,
  source: InsightFindingSource,
  severity: InsightSeverity
): number {
  const weight = severity === "high" ? 3_000_000 : severity === "medium" ? 2_000_000 : 1_000_000;
  const zScore = maxAbsoluteZScore(catalog, source);
  const salesGap = largestSalesTargetGap(catalog, source.attention.subjectKey);
  return weight + source.value * 1_000_000 + zScore * 1_000 + salesGap;
}

function maxAbsoluteZScore(catalog: InsightSourceCatalog, source: InsightFindingSource): number {
  const evidence = new Map(catalog.evidenceCandidates.map((candidate) => [candidate.id, candidate]));
  return Math.max(0, ...source.evidenceCandidateIds
    .map((id) => evidence.get(id))
    .filter((candidate) => candidate?.baselineLabel === "标准分")
    .flatMap((candidate) => candidate?.series.map((item) => Math.abs(item.value)) || []));
}

function largestSalesTargetGap(catalog: InsightSourceCatalog, subjectKey: string): number {
  return Math.max(0, ...catalog.findingSources
    .filter((source) => source.metricCode === "anomaly_day" && source.attention.subjectKey === subjectKey)
    .map((source) => Math.max(0, -(source.attention.delta ?? 0))));
}

function candidate(
  source: InsightFindingSource,
  severity: InsightSeverity,
  score: number,
  confidence: InsightAttentionCandidate["confidence"] = "high"
): InsightAttentionCandidate {
  return {
    sourceId: source.id,
    subjectKey: source.attention.subjectKey,
    role: "primary",
    score,
    severity,
    confidence,
    evidenceIds: source.evidenceCandidateIds,
  };
}

function toFinding(candidate: InsightAttentionCandidate): InsightAttentionPlan["findings"][number] {
  return {
    sourceId: candidate.sourceId,
    severity: candidate.severity,
    confidence: candidate.confidence,
    evidenceIds: candidate.evidenceIds,
  };
}

function actionContexts(
  catalog: InsightSourceCatalog,
  candidates: InsightAttentionCandidate[],
  mode: InsightActionContext["mode"]
): InsightActionContext[] {
  const sources = new Map(catalog.findingSources.map((source) => [source.id, source]));
  return candidates.flatMap((candidate) => {
    const source = sources.get(candidate.sourceId);
    return source ? [{
      id: source.id,
      sourceId: source.id,
      subjectLabel: source.label,
      severity: candidate.severity,
      mode,
      verificationMetricCode: source.metricCode,
    }] : [];
  });
}
