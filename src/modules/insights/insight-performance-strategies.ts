import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import {
  selectDiverseCandidates,
  type InsightActionContext,
  type InsightAttentionCandidate,
  type InsightAttentionPlan,
} from "./insight-attention-plan";
import type { InsightSeverity } from "./insight-types";
import type {
  InsightFindingSource,
  InsightSourceCatalog,
} from "./insight-source-catalog";

export interface InsightAttentionStrategy {
  build(catalog: InsightSourceCatalog): InsightAttentionPlan;
}

export const performanceAttentionStrategies: Partial<
  Record<AnalysisIntent, InsightAttentionStrategy>
> = {
  achievement_rate: { build: buildAchievementPlan },
  compare: { build: buildComparePlan },
  order_trend: { build: buildOrderPlan },
  aov_trend: { build: buildAovPlan },
};

function buildAchievementPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const rates = catalog.findingSources.filter((source) => source.metricCode === "achievement_rate");
  const storeRates = rates.filter((source) => source.attention.subjectKey !== "scope");
  const riskAssessments = storeRates.map((source) => ({
    source,
    severity: achievementSeverity(source.value),
    score: performanceScore(achievementSeverity(source.value), 100 - source.value),
  })).filter(({ severity }) => severity !== "positive");

  if (riskAssessments.length > 0) {
    return buildPerformancePlan(catalog, riskAssessments, (assessments) => {
      return assessments.flatMap(({ source, score, severity }) => {
        return supportCandidates(catalog, source, score, severity, ["sales_gap"]);
      });
    });
  }

  const overall = rates.find((source) => source.attention.subjectKey === "scope");
  const lowestStore = [...storeRates].sort((left, right) => {
    return left.value - right.value
      || left.attention.subjectKey.localeCompare(right.attention.subjectKey);
  })[0];
  const healthyAssessments = [
    ...(overall ? [{ source: overall, severity: "positive" as const, score: 2_000_000 }] : []),
    ...(lowestStore ? [{ source: lowestStore, severity: "positive" as const, score: 1_000_000 }] : []),
  ];

  return buildPerformancePlan(catalog, healthyAssessments, () => []);
}

function buildComparePlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const sources = subjectSources(catalog, "achievement_rate");
  const assessments = sources.map((source) => {
    const severity = achievementSeverity(source.value);
    const gapPct = targetGapPct(catalog, source.attention.subjectKey);
    const refundRate = valueForSubject(catalog, source.attention.subjectKey, "refund_rate")?.value || 0;
    return {
      source,
      severity,
      score: performanceScore(severity, 100 - source.value) + gapPct * 1_000 + refundRate,
    };
  });

  return buildPerformancePlan(catalog, assessments, (riskAssessments) => {
    const salesSupport = riskAssessments.flatMap(({ source, score }) => {
      return supportCandidates(catalog, source, score - 1, "low", ["sales"], "needs_verification");
    });
    const verificationSupport = compareVerificationCandidates(catalog, riskAssessments);
    return uniqueCandidates([...salesSupport, ...verificationSupport]);
  });
}

function buildOrderPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const assessments = [...subjectsFor(catalog, ["order_achievement_rate", "trend_pct"])]
    .flatMap((subjectKey) => {
      const rate = valueForSubject(catalog, subjectKey, "order_achievement_rate");
      const trend = valueForSubject(catalog, subjectKey, "trend_pct");
      if (!rate && !trend) return [];

      const achievementRate = rate?.value;
      const trendPct = trend?.value;
      const isRisk = (achievementRate !== undefined && achievementRate < 100)
        || (trendPct !== undefined && trendPct < 0);
      const severity: InsightSeverity = achievementRate !== undefined && (achievementRate < 90 || (trendPct !== undefined && trendPct <= -10))
        ? "high"
        : trendPct !== undefined && trendPct <= -10
          ? "high"
          : isRisk
            ? "medium"
            : "positive";
      const source = achievementRate !== undefined && achievementRate < 100
        ? rate!
        : trend || rate!;
      const score = performanceScore(
        severity,
        Math.max(0, 100 - (achievementRate ?? 100)) * 1_000 + Math.max(0, -(trendPct ?? 0))
      );

      return [{ source, severity, score }];
    });

  return buildPerformancePlan(catalog, assessments, (riskAssessments) => {
    return riskAssessments.flatMap(({ source, score, severity }) => {
      return alternatePrimaryCandidates(catalog, source, score, severity, ["order_achievement_rate", "trend_pct"]);
    });
  });
}

function buildAovPlan(catalog: InsightSourceCatalog): InsightAttentionPlan {
  const assessments = [...subjectsFor(catalog, ["aov_gap", "trend_pct"])]
    .flatMap((subjectKey) => {
      const gap = valueForSubject(catalog, subjectKey, "aov_gap");
      const trend = valueForSubject(catalog, subjectKey, "trend_pct");
      const avgAov = valueForSubject(catalog, subjectKey, "avg_aov");
      if (!gap && !trend) return [];

      const ratio = aovRatio(avgAov);
      const isRisk = (gap?.value ?? 0) < 0 || (trend?.value ?? 0) < 0;
      const severity: InsightSeverity = (ratio !== null && ratio < 90) || (trend?.value ?? 0) <= -10
        ? "high"
        : isRisk
          ? "medium"
          : "positive";
      const source = (gap?.value ?? 0) < 0 ? gap! : trend || gap!;
      const score = performanceScore(
        severity,
        Math.max(0, 100 - (ratio ?? 100)) * 1_000 + Math.max(0, -(trend?.value ?? 0))
      );

      return [{ source, severity, score }];
    });

  return buildPerformancePlan(catalog, assessments, (riskAssessments) => {
    return riskAssessments.flatMap(({ source, score, severity }) => {
      return alternatePrimaryCandidates(catalog, source, score, severity, ["aov_gap", "trend_pct"]);
    });
  });
}

function buildPerformancePlan(
  catalog: InsightSourceCatalog,
  assessments: Array<{ source: InsightFindingSource; severity: InsightSeverity; score: number }>,
  buildSupport: (assessments: Array<{ source: InsightFindingSource; severity: InsightSeverity; score: number }>) => InsightAttentionCandidate[]
): InsightAttentionPlan {
  if (assessments.length === 0) {
    return { status: "no_data", findings: [], actionContexts: [] };
  }

  const risks = assessments.filter(({ severity }) => severity === "high" || severity === "medium");
  const selectedAssessments = risks.length > 0 ? risks : assessments;
  const primaryCandidates = selectedAssessments.map(({ source, score, severity }) => candidate(source, score, severity));
  const support = risks.length > 0 ? buildSupport(risks) : [];
  const selected = selectDiverseCandidates([...primaryCandidates, ...support], {
    maxFindings: risks.length > 0 ? 5 : 3,
    minFindings: 1,
  });

  return {
    status: risks.length > 0 ? "risk" : "healthy",
    findings: selected.map(({ sourceId, severity, confidence, evidenceIds }) => ({
      sourceId,
      severity,
      confidence,
      evidenceIds,
    })),
    actionContexts: buildActionContexts(catalog, selected),
  };
}

function subjectSources(catalog: InsightSourceCatalog, metricCode: string): InsightFindingSource[] {
  const storeSources = catalog.findingSources.filter((source) => {
    return source.metricCode === metricCode && source.attention.subjectKey !== "scope";
  });
  return storeSources.length > 0
    ? storeSources
    : catalog.findingSources.filter((source) => source.metricCode === metricCode);
}

function subjectsFor(catalog: InsightSourceCatalog, metricCodes: string[]): Set<string> {
  return new Set(catalog.findingSources
    .filter((source) => metricCodes.includes(source.metricCode))
    .map((source) => source.attention.subjectKey));
}

function valueForSubject(
  catalog: InsightSourceCatalog,
  subjectKey: string,
  metricCode: string
): InsightFindingSource | undefined {
  return catalog.findingSources.find((source) => {
    return source.attention.subjectKey === subjectKey && source.metricCode === metricCode;
  });
}

function supportCandidates(
  catalog: InsightSourceCatalog,
  source: InsightFindingSource,
  score: number,
  severity: InsightSeverity,
  metricCodes: string[],
  confidence: InsightAttentionCandidate["confidence"] = "high"
): InsightAttentionCandidate[] {
  return catalog.findingSources
    .filter((item) => {
      return item.attention.subjectKey === source.attention.subjectKey
        && item.attention.role === "support"
        && metricCodes.includes(item.metricCode);
    })
    .map((item) => candidate(item, score - 0.5, severity, "support", confidence));
}

function compareVerificationCandidates(
  catalog: InsightSourceCatalog,
  assessments: Array<{ source: InsightFindingSource; severity: InsightSeverity; score: number }>
): InsightAttentionCandidate[] {
  const highestRiskScore = Math.max(...assessments.map(({ score }) => score));
  return ["refund_rate", "orders", "aov"].flatMap((metricCode, index) => {
    const source = crossStoreDifferenceSource(catalog, metricCode);
    return source
      ? [candidate(source, highestRiskScore - (index + 2), "low", "support", "needs_verification")]
      : [];
  });
}

function crossStoreDifferenceSource(
  catalog: InsightSourceCatalog,
  metricCode: string
): InsightFindingSource | undefined {
  const sources = catalog.findingSources.filter((source) => source.metricCode === metricCode);
  if (sources.length < 2 || new Set(sources.map((source) => source.value)).size < 2) return undefined;
  return [...sources].sort((left, right) => {
    return right.value - left.value
      || left.attention.subjectKey.localeCompare(right.attention.subjectKey);
  })[0];
}

function uniqueCandidates(candidates: InsightAttentionCandidate[]): InsightAttentionCandidate[] {
  const ids = new Set<string>();
  return candidates.filter((candidate) => {
    if (ids.has(candidate.sourceId)) return false;
    ids.add(candidate.sourceId);
    return true;
  });
}

function alternatePrimaryCandidates(
  catalog: InsightSourceCatalog,
  source: InsightFindingSource,
  score: number,
  severity: InsightSeverity,
  metricCodes: string[]
): InsightAttentionCandidate[] {
  return catalog.findingSources
    .filter((item) => {
      return item.id !== source.id
        && item.attention.subjectKey === source.attention.subjectKey
        && metricCodes.includes(item.metricCode);
    })
    .map((item) => candidate(item, score - 0.5, severity, "support"));
}

function candidate(
  source: InsightFindingSource,
  score: number,
  severity: InsightSeverity,
  role: InsightAttentionCandidate["role"] = "primary",
  confidence: InsightAttentionCandidate["confidence"] = "high"
): InsightAttentionCandidate {
  return {
    sourceId: source.id,
    subjectKey: source.attention.subjectKey,
    role,
    score,
    severity,
    confidence,
    evidenceIds: source.evidenceCandidateIds,
  };
}

function buildActionContexts(
  catalog: InsightSourceCatalog,
  candidates: InsightAttentionCandidate[]
): InsightActionContext[] {
  const sources = new Map(catalog.findingSources.map((source) => [source.id, source]));
  return candidates
    .filter((candidate) => candidate.role === "primary")
    .flatMap((candidate) => {
      const source = sources.get(candidate.sourceId);
      if (!source) return [];
      return [{
        id: source.id,
        sourceId: source.id,
        subjectLabel: source.label,
        severity: candidate.severity,
        mode: candidate.severity === "positive" ? "monitor" : "improve",
        verificationMetricCode: source.metricCode,
      }];
    });
}

function achievementSeverity(rate: number): InsightSeverity {
  if (rate < 90) return "high";
  if (rate < 100) return "medium";
  return "positive";
}

function performanceScore(severity: InsightSeverity, magnitude: number): number {
  const severityWeight = severity === "high"
    ? 3_000_000
    : severity === "medium"
      ? 2_000_000
      : 1_000_000;
  return severityWeight + Math.max(0, magnitude);
}

function targetGapPct(catalog: InsightSourceCatalog, subjectKey: string): number {
  const sales = valueForSubject(catalog, subjectKey, "sales");
  const benchmark = sales?.attention.benchmark;
  const delta = sales?.attention.delta;
  if (
    !sales
    || typeof benchmark !== "number"
    || !Number.isFinite(benchmark)
    || benchmark === 0
    || typeof delta !== "number"
    || !Number.isFinite(delta)
  ) return 0;
  return Math.max(0, -(delta / benchmark) * 100);
}

function aovRatio(source: InsightFindingSource | undefined): number | null {
  const target = source?.attention.benchmark;
  if (
    !source
    || typeof target !== "number"
    || !Number.isFinite(target)
    || target <= 0
  ) return null;
  return source.value / target * 100;
}
