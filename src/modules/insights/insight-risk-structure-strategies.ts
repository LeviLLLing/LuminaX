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
  channel_mix: { build: (catalog) => buildMixStructurePlan(catalog, "channel_pct", "channel_value") },
  daypart_analysis: { build: (catalog) => buildMixStructurePlan(catalog, "daypart_pct", "daypart_value") },
  promotion_contribution: { build: buildPromotionPlan },
};

interface RefundAssessment {
  candidate: InsightAttentionCandidate;
  rate: number;
}

interface AnomalyAssessment {
  candidate: InsightAttentionCandidate;
  count: number;
  zScore: number;
  salesTargetGap: number;
}

interface StructureAssessment {
  candidate: InsightAttentionCandidate;
  rank: number;
}

function buildRefundPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const overallRates = new Map<"refund" | "cancellation", number>();
  for (const source of catalog.findingSources) {
    const family = rateFamily(source);
    if (family && source.attention.subjectKey === "scope") overallRates.set(family, source.value);
  }

  const assessments = catalog.findingSources.flatMap((source): RefundAssessment[] => {
    const family = rateFamily(source);
    if (!family) return [];
    const severity = rateSeverity(source.value, overallRates.get(family), source.attention.subjectKey === "scope");
    return [{ candidate: candidate(source, severity), rate: source.value }];
  });
  const risks = assessments.filter(({ candidate }) => isRisk(candidate.severity));
  const selected = selectRanked(risks.length > 0 ? risks : assessments, compareRefundAssessments, {
    maxFindings: risks.length > 0 ? 5 : 3,
    minFindings: 1,
  });

  return planFromSelection(catalog, selected, risks.length > 0 ? "risk" : "healthy", risks.length > 0 ? "improve" : "monitor");
}

function buildAnomalyPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const assessments = catalog.findingSources
    .filter((source) => source.metricCode === "anomaly_count")
    .map((source): AnomalyAssessment => ({
      candidate: candidate(source, anomalySeverity(source.value)),
      count: source.value,
      zScore: maxAbsoluteZScore(catalog, source),
      salesTargetGap: largestSalesTargetGap(catalog, source.attention.subjectKey),
    }));
  const risks = assessments.filter(({ candidate }) => isRisk(candidate.severity));
  const selected = selectRanked(risks.length > 0 ? risks : assessments, compareAnomalyAssessments, {
    maxFindings: risks.length > 0 ? 5 : 3,
    minFindings: 1,
  });

  return planFromSelection(catalog, selected, risks.length > 0 ? "risk" : "healthy", risks.length > 0 ? "improve" : "monitor");
}

function buildMixStructurePlan(
  catalog: InsightSourceCatalog,
  aggregateMetricCode: "channel_pct" | "daypart_pct",
  storeMetricCode: "channel_value" | "daypart_value"
): InsightAttentionPlan {
  const aggregate = highestSource(catalog.findingSources.filter((source) => source.metricCode === aggregateMetricCode));
  const spread = widestSameDimensionSpread(catalog.findingSources.filter((source) => source.metricCode === storeMetricCode));
  return buildStructurePlan(catalog, [aggregate, spread?.source]);
}

function buildPromotionPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const aggregate = highestSource(catalog.findingSources.filter((source) => source.metricCode === "contribution_rate"));
  const storeSpread = widestSingleDimensionSpread(catalog.findingSources.filter((source) => source.metricCode === "store_contribution_rate"));
  const promotionConcentration = highestSource(catalog.findingSources.filter((source) => source.metricCode === "promotion_value"))
    || highestSource(catalog.findingSources.filter((source) => source.metricCode === "total_discount" && source.attention.subjectKey !== "scope"))
    || highestSource(catalog.findingSources.filter((source) => source.metricCode === "total_discount"));
  return buildStructurePlan(catalog, [aggregate, storeSpread?.source, promotionConcentration]);
}

function buildStructurePlan(
  catalog: InsightSourceCatalog,
  sources: Array<InsightFindingSource | undefined>
): InsightAttentionPlan {
  const selected = selectRanked(
    sources.flatMap((source, rank): StructureAssessment[] => source ? [{
      candidate: candidate(source, "low", "needs_verification"),
      rank,
    }] : []),
    (left, right) => left.rank - right.rank || left.candidate.sourceId.localeCompare(right.candidate.sourceId),
    { maxFindings: 3, minFindings: 1 }
  );
  return planFromSelection(catalog, selected, selected.length > 0 ? "healthy" : "no_data", "verify");
}

function planFromSelection(
  catalog: InsightSourceCatalog,
  selected: InsightAttentionCandidate[],
  status: InsightAttentionPlan["status"],
  mode: InsightActionContext["mode"]
): InsightAttentionPlan {
  return {
    status,
    findings: selected.map(toFinding),
    actionContexts: actionContexts(catalog, selected, mode),
  };
}

function selectRanked<T extends { candidate: InsightAttentionCandidate }>(
  assessments: T[],
  compare: (left: T, right: T) => number,
  options: { maxFindings: number; minFindings: number }
): InsightAttentionCandidate[] {
  const sorted = [...assessments].sort(compare);
  // The selector keeps subject diversity; ordinal scores preserve this policy's comparator exactly.
  return selectDiverseCandidates(sorted.map((assessment, index) => ({
    ...assessment.candidate,
    score: sorted.length - index,
  })), options);
}

function compareRefundAssessments(left: RefundAssessment, right: RefundAssessment): number {
  return severityRank(right.candidate.severity) - severityRank(left.candidate.severity)
    || right.rate - left.rate
    || left.candidate.sourceId.localeCompare(right.candidate.sourceId);
}

function compareAnomalyAssessments(left: AnomalyAssessment, right: AnomalyAssessment): number {
  return right.count - left.count
    || right.zScore - left.zScore
    || right.salesTargetGap - left.salesTargetGap
    || left.candidate.sourceId.localeCompare(right.candidate.sourceId);
}

function rateFamily(source: InsightFindingSource): "refund" | "cancellation" | null {
  if (source.metricCode === "refund_rate" || source.metricCode === "store_refund_rate" || source.metricCode === "daily_refund_rate") return "refund";
  return source.metricCode === "cancel_rate" ? "cancellation" : null;
}

function rateSeverity(rate: number, overallRate: number | undefined, isOverall: boolean): InsightSeverity {
  if (rate > 2) return "high";
  if (!isOverall && overallRate !== undefined && rate - overallRate >= 0.5) return "medium";
  return rate <= (overallRate ?? rate) ? "positive" : "low";
}

function anomalySeverity(count: number): InsightSeverity {
  if (count >= 2) return "high";
  if (count === 1) return "medium";
  return "positive";
}

function severityRank(severity: InsightSeverity): number {
  return severity === "high" ? 3 : severity === "medium" ? 2 : severity === "low" ? 1 : 0;
}

function isRisk(severity: InsightSeverity): boolean {
  return severity === "high" || severity === "medium";
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

function highestSource(sources: InsightFindingSource[]): InsightFindingSource | undefined {
  return [...sources].sort((left, right) => right.value - left.value || left.id.localeCompare(right.id))[0];
}

function widestSameDimensionSpread(sources: InsightFindingSource[]): { source: InsightFindingSource; spread: number; dimension: string } | undefined {
  const dimensions = new Map<string, InsightFindingSource[]>();
  for (const source of sources) {
    const dimension = source.subjectIds[1];
    if (!dimension) continue;
    const items = dimensions.get(dimension) || [];
    items.push(source);
    dimensions.set(dimension, items);
  }
  const candidates = [...dimensions.entries()].flatMap(([dimension, items]) => {
    const stores = new Set(items.map((item) => item.subjectIds[0]));
    if (stores.size < 2) return [];
    const highest = highestSource(items);
    const lowest = [...items].sort((left, right) => left.value - right.value || left.id.localeCompare(right.id))[0];
    return highest && lowest ? [{ source: highest, spread: highest.value - lowest.value, dimension }] : [];
  });
  return candidates.sort((left, right) => right.spread - left.spread || left.dimension.localeCompare(right.dimension) || left.source.id.localeCompare(right.source.id))[0];
}

function widestSingleDimensionSpread(sources: InsightFindingSource[]): { source: InsightFindingSource; spread: number } | undefined {
  if (new Set(sources.map((source) => source.attention.subjectKey)).size < 2) return undefined;
  const highest = highestSource(sources);
  const lowest = [...sources].sort((left, right) => left.value - right.value || left.id.localeCompare(right.id))[0];
  return highest && lowest ? { source: highest, spread: highest.value - lowest.value } : undefined;
}

function candidate(
  source: InsightFindingSource,
  severity: InsightSeverity,
  confidence: InsightAttentionCandidate["confidence"] = "high"
): InsightAttentionCandidate {
  return {
    sourceId: source.id,
    subjectKey: source.attention.subjectKey,
    role: "primary",
    score: 0,
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
