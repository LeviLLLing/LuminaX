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
    name: "achievement is healthy at 100 percent",
    intent: "achievement_rate",
    catalog: catalogForRates([["S001", "A", 100]]),
    expected: "positive",
  },
  {
    name: "achievement is medium at 90 percent",
    intent: "achievement_rate",
    catalog: catalogForRates([["S001", "A", 90]]),
    expected: "medium",
  },
  {
    name: "compare is healthy when every store is at target",
    intent: "compare",
    catalog: compareCatalog([
      compareStore("S001", "A", 100, 100),
      compareStore("S002", "B", 100, 100),
    ]),
    expected: "positive",
  },
  {
    name: "compare is medium at 90 percent",
    intent: "compare",
    catalog: compareCatalog([compareStore("S001", "A", 90, 90)]),
    expected: "medium",
  },
  {
    name: "order is healthy at target without a decline",
    intent: "order_trend",
    catalog: orderCatalog("S001", 100, 0),
    expected: "positive",
  },
  {
    name: "order critical rate",
    intent: "order_trend",
    catalog: orderCatalog("S001", 89, 2),
    expected: "high",
  },
  {
    name: "order is medium at the 90 percent boundary",
    intent: "order_trend",
    catalog: orderCatalog("S001", 90, 0),
    expected: "medium",
  },
  {
    name: "order critical trend",
    intent: "order_trend",
    catalog: orderCatalog("S001", 101, -10),
    expected: "high",
  },
  {
    name: "order is medium above the critical decline boundary",
    intent: "order_trend",
    catalog: orderCatalog("S001", 100, -9),
    expected: "medium",
  },
  {
    name: "aov is healthy at target without a decline",
    intent: "aov_trend",
    catalog: aovCatalog("S001", 100, 100, 0),
    expected: "positive",
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
  {
    name: "aov is medium at the 90 percent boundary",
    intent: "aov_trend",
    catalog: aovCatalog("S001", 90, 100, 0),
    expected: "medium",
  },
  {
    name: "aov is medium above the critical decline boundary",
    intent: "aov_trend",
    catalog: aovCatalog("S001", 100, 100, -9),
    expected: "medium",
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

test("healthy achievement includes overall attainment and the lowest-achievement store within the healthy quota", () => {
  const catalog = catalogForRates([
    ["S001", "A", 105],
    ["S004", "B", 101],
    ["S005", "C", 103],
    ["S006", "D", 102],
  ]);
  const plan = buildInsightAttentionPlan({ intent: "achievement_rate", catalog });

  assert.equal(plan.status, "healthy");
  assert.ok(plan.findings.length >= 1 && plan.findings.length <= 3);
  assert.deepEqual(plan.findings.map((finding) => subjectOfFinding(catalog, finding.sourceId)), ["scope", "S004"]);
  assert.ok(plan.findings.every((finding) => finding.severity === "positive"));
});

test("compare strategy treats below-target performance as risk instead of low sales", () => {
  const catalog = compareCatalog([
    compareStore("S001", "低销售达标店", 100, 105),
    compareStore("S004", "高销售未达标店", 1000, 85),
  ]);

  const plan = buildInsightAttentionPlan({ intent: "compare", catalog });
  const riskSubjects = plan.findings
    .filter((finding) => finding.severity === "high" || finding.severity === "medium")
    .map((finding) => subjectOfFinding(catalog, finding.sourceId));

  assert.deepEqual([...new Set(riskSubjects)], ["S004"]);
});

test("compare includes cross-store verification signals without making an at-target store a risk", () => {
  const catalog = compareCatalog([
    compareStore("S004", "未达标店", 800, 85, { totalOrders: 100, avgOrderValue: 20, refundRate: 4 }),
    compareStore("S001", "达标差异店", 500, 100, { totalOrders: 1_000, avgOrderValue: 80, refundRate: 1 }),
  ]);
  const plan = buildInsightAttentionPlan({ intent: "compare", catalog });
  const sources = plan.findings.map((finding) => sourceOfFinding(catalog, finding.sourceId));

  assert.deepEqual(
    sources.map((source) => source.metricCode),
    ["achievement_rate", "sales", "refund_rate", "orders", "aov"]
  );
  assert.ok(sources.some((source) => source.metricCode === "orders" && source.subjectIds[0] === "S001"));
  assert.ok(sources.some((source) => source.metricCode === "aov" && source.subjectIds[0] === "S001"));
  assert.equal(plan.findings[0]?.severity, "high");
  assert.ok(plan.findings.slice(1).every((finding) => finding.severity === "low"));
});

for (const scenario of [
  {
    name: "target-gap percentage before refund rate",
    stores: [
      compareStore("S001", "A", 950, 95, { totalTarget: 1_000, refundRate: 1 }),
      compareStore("S002", "B", 9_500, 95, { totalTarget: 10_100, refundRate: 9 }),
    ],
    expected: ["S002", "S001"],
  },
  {
    name: "refund rate after equal target-gap percentage",
    stores: [
      compareStore("S001", "A", 950, 95, { totalTarget: 1_000, refundRate: 1 }),
      compareStore("S002", "B", 950, 95, { totalTarget: 1_000, refundRate: 4 }),
    ],
    expected: ["S002", "S001"],
  },
  {
    name: "stable subject key after equal target gap and refund rate",
    stores: [
      compareStore("S002", "B", 950, 95, { totalTarget: 1_000, refundRate: 2 }),
      compareStore("S001", "A", 950, 95, { totalTarget: 1_000, refundRate: 2 }),
    ],
    expected: ["S001", "S002"],
  },
] as const) {
  test(`compare tie-break uses ${scenario.name} independent of row order`, () => {
    const catalog = compareCatalog([...scenario.stores].reverse());
    const plan = buildInsightAttentionPlan({ intent: "compare", catalog });

    assert.deepEqual(
      plan.findings.slice(0, 2).map((finding) => subjectOfFinding(catalog, finding.sourceId)),
      scenario.expected
    );
  });
}

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
  achievementRate: number,
  options: {
    totalTarget?: number;
    totalOrders?: number;
    avgOrderValue?: number;
    refundRate?: number;
  } = {}
): Record<string, unknown> {
  const totalTarget = options.totalTarget ?? totalSales / (achievementRate / 100);
  return {
    storeId,
    storeName,
    totalSales,
    totalTarget,
    achievementRate,
    totalOrders: options.totalOrders ?? 100,
    avgOrderValue: options.avgOrderValue ?? 10,
    totalRefund: 0,
    refundRate: options.refundRate ?? 0,
    channelBreakdown: {},
    categoryBreakdown: {},
    daypartBreakdown: {},
  };
}

function compareCatalog(stores: Record<string, unknown>[]): InsightSourceCatalog {
  return buildInsightSourceCatalog({
    intent: "compare",
    analysisData: { stores },
  });
}

function subjectOfFinding(catalog: InsightSourceCatalog, sourceId: string): string {
  const source = sourceOfFinding(catalog, sourceId);
  return source.subjectIds[0] || "scope";
}

function sourceOfFinding(catalog: InsightSourceCatalog, sourceId: string) {
  const source = catalog.findingSources.find((item) => item.id === sourceId);
  assert.ok(source, `missing source ${sourceId}`);
  return source;
}
