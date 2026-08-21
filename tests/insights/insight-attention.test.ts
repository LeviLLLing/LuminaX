import assert from "node:assert/strict";
import test from "node:test";
import {
  selectDiverseCandidates,
  type InsightAttentionCandidate,
} from "../../src/modules/insights/insight-attention-plan";
import { buildInsightAttentionPlan } from "../../src/modules/insights/insight-attention-registry";
import {
  buildInsightSourceCatalog,
  type InsightSourceCatalog,
} from "../../src/modules/insights/insight-source-catalog";

test("primary findings cover distinct subjects before support facts", () => {
  const selected = selectDiverseCandidates([
    candidate("metro-rate", "S004", "primary", 100),
    candidate("metro-gap", "S004", "support", 95),
    candidate("community-rate", "S005", "primary", 90),
    candidate("community-gap", "S005", "support", 85),
  ], { maxFindings: 3, minFindings: 1 });

  assert.deepEqual(selected.map((item) => item.sourceId), [
    "metro-rate",
    "community-rate",
    "metro-gap",
  ]);
});

test("healthy plans do not invent risk findings to reach three items", () => {
  const selected = selectDiverseCandidates([
    candidate("overall", "scope", "primary", 10, "positive"),
  ], { maxFindings: 5, minFindings: 1 });

  assert.equal(selected.length, 1);
  assert.equal(selected[0].severity, "positive");
});

test("equal-score candidates are ordered by source ID", () => {
  const selected = selectDiverseCandidates([
    candidate("zeta", "S003", "primary", 10),
    candidate("alpha", "S001", "primary", 10),
    candidate("beta", "S002", "primary", 10),
  ], { maxFindings: 3, minFindings: 0 });

  assert.deepEqual(selected.map((item) => item.sourceId), [
    "alpha",
    "beta",
    "zeta",
  ]);
});

for (const scenario of [
  { name: "floors a fractional maximum", maxFindings: 1.5, expected: ["first"] },
  { name: "returns no candidates for a zero maximum", maxFindings: 0, expected: [] },
  { name: "returns no candidates for a negative maximum", maxFindings: -1, expected: [] },
  { name: "returns no candidates for NaN maximum", maxFindings: Number.NaN, expected: [] },
  { name: "returns no candidates for an infinite maximum", maxFindings: Infinity, expected: [] },
  { name: "returns no candidates for a negative infinite maximum", maxFindings: -Infinity, expected: [] },
]) {
  test(`quota normalization ${scenario.name}`, () => {
    const selected = selectDiverseCandidates([
      candidate("first", "S001", "primary", 10),
      candidate("second", "S002", "primary", 9),
    ], { maxFindings: scenario.maxFindings, minFindings: 0 });

    assert.deepEqual(selected.map((item) => item.sourceId), scenario.expected);
  });
}

test("minimum quota does not pad candidates when it is non-finite", () => {
  const selected = selectDiverseCandidates([
    candidate("only", "scope", "primary", 10, "positive"),
  ], { maxFindings: 5, minFindings: Infinity });

  assert.deepEqual(selected.map((item) => item.sourceId), ["only"]);
});

test("achievement strategy ranks actual underperformers independent of row order", () => {
  const catalog = catalogForRates([
    ["S001", "上海商场店", 102],
    ["S004", "地铁站店", 82],
    ["S005", "社区中心店", 94],
  ]);

  const plan = buildInsightAttentionPlan({
    intent: "achievement_rate",
    catalog,
  });

  assert.deepEqual(plan.findings.slice(0, 2).map((finding) => subjectOfFinding(catalog, finding.sourceId)), ["S004", "S005"]);
  assert.deepEqual(plan.findings.slice(0, 2).map((finding) => finding.severity), ["high", "medium"]);
});

for (const scenario of [
  {
    name: "healthy achievement",
    intent: "achievement_rate",
    catalog: catalogForRates([["S001", "A", 101]]),
    expected: "positive",
  },
  {
    name: "order critical rate",
    intent: "order_trend",
    catalog: orderCatalog("S001", 89, 2),
    expected: "high",
  },
  {
    name: "order critical trend",
    intent: "order_trend",
    catalog: orderCatalog("S001", 101, -10),
    expected: "high",
  },
  {
    name: "aov critical ratio",
    intent: "aov_trend",
    catalog: aovCatalog("S001", 89, 100, 1),
    expected: "high",
  },
  {
    name: "aov critical trend",
    intent: "aov_trend",
    catalog: aovCatalog("S001", 101, 100, -10),
    expected: "high",
  },
] as const) {
  test(`performance policy ${scenario.name}`, () => {
    const plan = buildInsightAttentionPlan({
      intent: scenario.intent,
      catalog: scenario.catalog,
    });

    assert.equal(plan.findings[0]?.severity, scenario.expected);
  });
}

test("compare strategy treats below-target performance as risk instead of low sales", () => {
  const catalog = buildInsightSourceCatalog({
    intent: "compare",
    analysisData: {
      stores: [
        compareStore("S001", "低销售达标店", 100, 105),
        compareStore("S004", "高销售未达标店", 1000, 85),
      ],
    },
  });

  const plan = buildInsightAttentionPlan({ intent: "compare", catalog });
  const riskSubjects = plan.findings
    .filter((finding) => finding.severity === "high" || finding.severity === "medium")
    .map((finding) => subjectOfFinding(catalog, finding.sourceId));

  assert.deepEqual([...new Set(riskSubjects)], ["S004"]);
});

function candidate(
  sourceId: string,
  subjectKey: string,
  role: InsightAttentionCandidate["role"],
  score: number,
  severity: InsightAttentionCandidate["severity"] = "medium"
): InsightAttentionCandidate {
  return {
    sourceId,
    subjectKey,
    role,
    score,
    severity,
    confidence: "high",
    evidenceIds: [],
  };
}

function catalogForRates(rows: Array<[string, string, number]>): InsightSourceCatalog {
  const stores = rows.map(([storeId, storeName, achievementRate]) => {
    const totalTarget = 100;
    const totalSales = totalTarget * achievementRate / 100;
    return {
      storeId,
      storeName,
      totalSales,
      totalTarget,
      gap: totalSales - totalTarget,
      achievementRate,
    };
  });
  const totalSales = stores.reduce((sum, store) => sum + store.totalSales, 0);
  const totalTarget = stores.reduce((sum, store) => sum + store.totalTarget, 0);

  return buildInsightSourceCatalog({
    intent: "achievement_rate",
    analysisData: {
      stores,
      overall: {
        totalSales,
        totalTarget,
        gap: totalSales - totalTarget,
        achievementRate: totalSales / totalTarget * 100,
      },
    },
  });
}

function orderCatalog(
  storeId: string,
  orderAchievementRate: number,
  trendPct: number
): InsightSourceCatalog {
  return buildInsightSourceCatalog({
    intent: "order_trend",
    analysisData: {
      stores: [{
        storeId,
        storeName: `${storeId}店`,
        totalOrders: 100,
        totalOrderTarget: 100,
        orderAchievementRate,
        trendPct,
      }],
    },
  });
}

function aovCatalog(
  storeId: string,
  avgAOV: number,
  targetAOV: number,
  trendPct: number
): InsightSourceCatalog {
  return buildInsightSourceCatalog({
    intent: "aov_trend",
    analysisData: {
      stores: [{
        storeId,
        storeName: `${storeId}店`,
        avgAOV,
        targetAOV,
        aovGap: avgAOV - targetAOV,
        trendPct,
      }],
    },
  });
}

function compareStore(
  storeId: string,
  storeName: string,
  totalSales: number,
  achievementRate: number
): Record<string, unknown> {
  const totalTarget = totalSales / (achievementRate / 100);
  return {
    storeId,
    storeName,
    totalSales,
    totalTarget,
    achievementRate,
    totalOrders: 100,
    avgOrderValue: 10,
    totalRefund: 0,
    refundRate: 0,
    channelBreakdown: {},
    categoryBreakdown: {},
    daypartBreakdown: {},
  };
}

function subjectOfFinding(catalog: InsightSourceCatalog, sourceId: string): string {
  const source = catalog.findingSources.find((item) => item.id === sourceId);
  assert.ok(source, `missing source ${sourceId}`);
  return source.subjectIds[0] || "scope";
}
