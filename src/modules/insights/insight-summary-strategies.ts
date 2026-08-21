import {
  selectDiverseCandidates,
  type InsightActionContext,
  type InsightAttentionCandidate,
  type InsightAttentionPlan,
} from "./insight-attention-plan";
import type { InsightAttentionStrategy } from "./insight-performance-strategies";
import type { InsightSeverity } from "./insight-types";
import type {
  InsightFindingSource,
  InsightSourceCatalog,
} from "./insight-source-catalog";

export const summaryAttentionStrategies = {
  attribution: { build: buildAttributionPlan },
  report: { build: buildReportPlan },
  custom_metric: { build: buildCustomMetricPlan },
} satisfies Partial<Record<"attribution" | "report" | "custom_metric", InsightAttentionStrategy>>;

function buildAttributionPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const totalGap = catalog.findingSources.find((source) => {
    return source.metricCode === "decomposition" && source.label === "总差异";
  });
  const drivers = catalog.findingSources.filter((source) => {
    return source.attention.signal === "contribution" && source.id !== totalGap?.id;
  });
  const negativeDrivers = totalGap && totalGap.value < 0
    ? drivers.filter((source) => source.value < 0)
    : [];

  if (negativeDrivers.length > 0) {
    const largestNegativeDriver = largestMagnitude(negativeDrivers);
    const selected = selectDiverseCandidates([
      ...negativeDrivers.map((source) => candidate(
        source,
        source === largestNegativeDriver ? "high" : "medium",
        Math.abs(source.value),
        source === largestNegativeDriver ? "primary" : "support"
      )),
      ...drivers
        .filter((source) => source.value > 0)
        .map((source) => candidate(source, "positive", Math.abs(source.value), "support")),
    ], { maxFindings: 5, minFindings: 1 });
    return planFromCandidates(catalog, selected, "risk", "improve");
  }

  const positiveDrivers = drivers.filter((source) => source.value > 0);
  const selected = selectDiverseCandidates(
    positiveDrivers.map((source) => candidate(source, "positive", source.value, "primary")),
    { maxFindings: 3, minFindings: 1 }
  );
  return planFromCandidates(catalog, selected, selected.length > 0 ? "healthy" : "no_data", "monitor");
}

function buildReportPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const noData = catalog.findingSources.find((source) => {
    return source.metricCode === "data_availability" && source.value === 0;
  });
  if (noData) {
    return planFromCandidates(
      catalog,
      [candidate(noData, "positive", 1, "primary")],
      "no_data",
      "monitor"
    );
  }

  const candidates: InsightAttentionCandidate[] = [];
  const overallRate = catalog.findingSources.find((source) => {
    return source.metricCode === "achievement_rate" && source.attention.subjectKey === "scope";
  });
  if (overallRate) {
    candidates.push(candidate(
      overallRate,
      overallRate.value < 95 ? "high" : "positive",
      reportScore(overallRate, 3),
      "primary",
      "high",
      "scope:achievement"
    ));
  }

  for (const source of catalog.findingSources) {
    if (source.metricCode !== "achievement_rate" || source.attention.subjectKey === "scope") continue;
    const severity = source.value < 90 ? "high" : source.value < 100 ? "medium" : "positive";
    candidates.push(candidate(source, severity, reportScore(source, 2), "primary"));
  }

  for (const source of catalog.findingSources) {
    if (source.metricCode !== "refund_rate") continue;
    candidates.push(candidate(
      source,
      source.value > 2 ? "high" : "positive",
      reportScore(source, 1),
      "primary",
      "high",
      "scope:refund"
    ));
  }

  for (const source of catalog.findingSources) {
    if (source.metricCode !== "daily_anomaly" || source.value <= 0) continue;
    candidates.push(candidate(source, "low", 1, "support", "needs_verification"));
  }

  const risks = candidates.filter((item) => item.severity === "high" || item.severity === "medium");
  const selected = selectDiverseCandidates(
    risks.length > 0 ? candidates : candidates.filter((item) => item.role === "primary"),
    { maxFindings: risks.length > 0 ? 5 : 3, minFindings: 1 }
  );
  return planFromCandidates(
    catalog,
    selected,
    risks.length > 0 ? "risk" : selected.length > 0 ? "healthy" : "no_data",
    risks.length > 0 ? "improve" : "monitor"
  );
}

function buildCustomMetricPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const noData = catalog.findingSources.find((source) => {
    return source.metricCode === "data_availability" && source.value === 0;
  });
  if (noData) {
    return planFromCandidates(
      catalog,
      [candidate(noData, "positive", 1, "primary")],
      "no_data",
      "monitor"
    );
  }

  const selected = selectDiverseCandidates(
    catalog.findingSources
      .filter((source) => source.metricCode !== "data_availability")
      .map((source) => candidate(source, "low", 1, "primary", "needs_verification")),
    { maxFindings: 3, minFindings: 1 }
  );
  return planFromCandidates(catalog, selected, selected.length > 0 ? "healthy" : "no_data", "verify");
}

function largestMagnitude(sources: InsightFindingSource[]): InsightFindingSource {
  return [...sources].sort((left, right) => {
    return Math.abs(right.value) - Math.abs(left.value) || left.id.localeCompare(right.id);
  })[0];
}

function reportScore(source: InsightFindingSource, category: number): number {
  const severity = source.metricCode === "refund_rate"
    ? source.value > 2 ? 3 : 1
    : source.attention.subjectKey === "scope"
      ? source.value < 95 ? 3 : 1
      : source.value < 90 ? 3 : source.value < 100 ? 2 : 1;
  return severity * 1_000_000 + category * 10_000 + Math.max(0, 100 - source.value);
}

function candidate(
  source: InsightFindingSource,
  severity: InsightSeverity,
  score: number,
  role: InsightAttentionCandidate["role"],
  confidence: InsightAttentionCandidate["confidence"] = "high",
  subjectKey = source.attention.subjectKey
): InsightAttentionCandidate {
  return {
    sourceId: source.id,
    subjectKey,
    role,
    score,
    severity,
    confidence,
    evidenceIds: source.evidenceCandidateIds,
  };
}

function planFromCandidates(
  catalog: InsightSourceCatalog,
  candidates: InsightAttentionCandidate[],
  status: InsightAttentionPlan["status"],
  mode: InsightActionContext["mode"]
): InsightAttentionPlan {
  const sources = new Map(catalog.findingSources.map((source) => [source.id, source]));
  return {
    status,
    findings: candidates.map((item) => ({
      sourceId: item.sourceId,
      severity: item.severity,
      confidence: item.confidence,
      evidenceIds: item.evidenceIds,
    })),
    actionContexts: candidates
      .filter((item) => item.role === "primary")
      .flatMap((item) => {
        const source = sources.get(item.sourceId);
        return source ? [{
          id: source.id,
          sourceId: source.id,
          subjectLabel: source.label,
          severity: item.severity,
          mode,
          verificationMetricCode: source.metricCode,
        }] : [];
      }),
  };
}
