import assert from "node:assert/strict";
import test from "node:test";
import {
  selectDiverseCandidates,
  type InsightAttentionCandidate,
} from "../../src/modules/insights/insight-attention-plan";
import { buildInsightAttentionPlan } from "../../src/modules/insights/insight-attention-registry";
import { InsightValidationError } from "../../src/modules/insights/insight-validator";
import {
  buildInsightSourceCatalog,
  type InsightSourceCatalog,
} from "../../src/modules/insights/insight-source-catalog";

let activeMetricCatalog: InsightSourceCatalog;

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

test("summary strategies preserve business priority", () => {
  const attribution = planFor("attribution", attributionCatalog([
    ["orders", -30], ["aov", -20], ["channel", 10],
  ]));
  assert.deepEqual(attribution.findings.slice(0, 2).map(metricOfFinding), ["orders", "aov"]);

  const report = planFor("report", reportCatalog({
    overallRate: 94, worstStoreRate: 88, refundRate: 2.4, anomalyCount: 1,
  }));
  assert.deepEqual(report.findings.slice(0, 3).map(metricOfFinding), [
    "achievement_rate", "store_achievement_rate", "refund_rate",
  ]);

  const custom = planFor("custom_metric", customCatalog(42));
  assert.ok(custom.findings.every((item) => item.severity === "low"));

  const noData = planFor("custom_metric", noDataCatalog());
  assert.equal(noData.status, "no_data");
  assert.equal(noData.findings[0].severity, "positive");
});

test("attribution retains same-scope negative decomposition drivers as deterministic support facts", () => {
  const catalog = sameScopeAttributionCatalog();
  const plan = buildInsightAttentionPlan({ intent: "attribution", catalog });

  assert.deepEqual(
    plan.findings.map((finding) => {
      const source = sourceOfFinding(catalog, finding.sourceId);
      return [source.label, finding.severity];
    }),
    [["订单量差异", "high"], ["客单价差异", "medium"]]
  );
  assert.deepEqual(plan.actionContexts.map((context) => context.sourceId), [plan.findings[0]?.sourceId]);
});

test("attribution selects every negative decomposition driver before positive supports fill the quota", () => {
  const catalog = sameScopeAttributionCatalog({
    interaction: -20,
    positiveFactors: ["渠道", "品类", "时段", "活动"],
  });
  const plan = buildInsightAttentionPlan({ intent: "attribution", catalog });

  assert.deepEqual(
    plan.findings.map((finding) => sourceOfFinding(catalog, finding.sourceId).label),
    ["订单量差异", "客单价差异", "交互项", "渠道", "品类"]
  );
  assert.deepEqual(plan.findings.slice(0, 3).map((finding) => finding.severity), ["high", "medium", "medium"]);
});

test("report no-data catalog keeps its positive availability finding and monitor action", () => {
  const catalog = reportNoDataCatalog();
  const plan = buildInsightAttentionPlan({ intent: "report", catalog });

  assert.equal(plan.status, "no_data");
  assert.deepEqual(plan.findings.map((finding) => ({
    metricCode: sourceOfFinding(catalog, finding.sourceId).metricCode,
    severity: finding.severity,
  })), [{ metricCode: "data_availability", severity: "positive" }]);
  assert.deepEqual(plan.actionContexts.map((context) => ({
    severity: context.severity,
    mode: context.mode,
    verificationMetricCode: context.verificationMetricCode,
  })), [{ severity: "positive", mode: "monitor", verificationMetricCode: "data_availability" }]);
});

test("irrelevant intent rejects before the exhaustive strategy registry lookup", () => {
  assert.throws(
    () => buildInsightAttentionPlan({ intent: "irrelevant", catalog: customCatalog(42) }),
    (error: unknown) => error instanceof InsightValidationError && error.code === "INSUFFICIENT_SOURCE_DATA"
  );
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

test("refund strategy prioritizes high rates, then above-range rates, independent of input order", () => {
  const catalog = refundCatalog({
    overall: 1.2,
    stores: [
      ["S005", "社区中心店", 1.8],
      ["S001", "上海商场店", 0.8],
      ["S004", "地铁站店", 2.4],
    ],
  });

  const plan = buildInsightAttentionPlan({ intent: "refund_rate", catalog });

  assert.equal(plan.status, "risk");
  assert.deepEqual(
    plan.findings.slice(0, 2).map((finding) => ({
      subject: subjectOfFinding(catalog, finding.sourceId),
      severity: finding.severity,
    })),
    [
      { subject: "S004", severity: "high" },
      { subject: "S005", severity: "medium" },
    ]
  );
});

test("anomaly strategy sorts equal counts by absolute z-score before the stable subject key", () => {
  const catalog = anomalyCatalog([
    ["S005", "社区中心店", 2, 1.5],
    ["S001", "上海商场店", 2, 3.5],
    ["S004", "地铁站店", 1, 9],
  ]);

  const plan = buildInsightAttentionPlan({ intent: "anomaly_detection", catalog });

  assert.deepEqual(
    plan.findings.map((finding) => ({
      subject: subjectOfFinding(catalog, finding.sourceId),
      severity: finding.severity,
    })),
    [
      { subject: "S001", severity: "high" },
      { subject: "S005", severity: "high" },
      { subject: "S004", severity: "medium" },
    ]
  );
});

test("healthy refund and structure plans stay neutral and use benchmark-verification actions", () => {
  const healthyRefund = buildInsightAttentionPlan({
    intent: "refund_rate",
    catalog: refundCatalog({ overall: 1.2, stores: [["S001", "上海商场店", 0.8]] }),
  });
  assert.equal(healthyRefund.status, "healthy");
  assert.ok(healthyRefund.findings.every((finding) => finding.severity === "positive" || finding.severity === "low"));

  for (const intent of ["channel_mix", "daypart_analysis", "promotion_contribution"] as const) {
    const catalog = structureCatalog(intent);
    const plan = buildInsightAttentionPlan({ intent, catalog });

    assert.equal(plan.status, "healthy");
    assert.ok(plan.findings.length > 0);
    assert.ok(plan.findings.every((finding) => finding.severity === "low" || finding.severity === "positive"));
    assert.ok(plan.findings.every((finding) => finding.confidence === "needs_verification"));
    assert.ok(plan.actionContexts.every((context) => context.mode === "verify"));
  }
});

for (const scenario of [
  { name: "exactly two percent", overall: 1.5, rate: 2, status: "risk", severity: "medium" },
  { name: "exactly 0.5 percentage points above range", overall: 1.5, rate: 2, status: "risk", severity: "medium" },
  { name: "just below 0.5 percentage points above range", overall: 1.5, rate: 1.999, status: "healthy", severity: "low" },
] as const) {
  test(`refund boundary ${scenario.name}`, () => {
    const catalog = refundCatalog({
      overall: scenario.overall,
      stores: [["S001", "上海商场店", scenario.rate]],
    });
    const plan = buildInsightAttentionPlan({ intent: "refund_rate", catalog });

    assert.equal(plan.status, scenario.status);
    assert.equal(plan.findings[0]?.severity, scenario.severity);
  });
}

test("refund planning includes scope, daily, and cancellation risk facts", () => {
  const catalog = refundCatalog({
    overall: 2.3,
    cancelOverall: 0.5,
    daily: [["2025-05-01", 2.8]],
    stores: [["S001", "上海商场店", 0.8, 2.6]],
  });
  const plan = buildInsightAttentionPlan({ intent: "refund_rate", catalog });
  const sources = plan.findings.map((finding) => sourceOfFinding(catalog, finding.sourceId));

  assert.ok(sources.some((source) => source.metricCode === "refund_rate" && source.attention.subjectKey === "scope"));
  assert.ok(sources.some((source) => source.metricCode === "daily_refund_rate"));
  assert.ok(sources.some((source) => source.metricCode === "cancel_rate" && source.subjectIds[0] === "S001"));
  assert.ok(plan.findings.every((finding) => finding.severity === "high"));
});

test("healthy refund rates sort descending and break equal rates by stable source ID", () => {
  const catalog = refundCatalog({
    overall: 1.6,
    stores: [
      ["S003", "C店", 1.7],
      ["S002", "B店", 1.7],
      ["S001", "A店", 1.4],
    ],
  });
  const plan = buildInsightAttentionPlan({ intent: "refund_rate", catalog });

  assert.equal(plan.status, "healthy");
  assert.deepEqual(
    plan.findings.map((finding) => ({
      subject: subjectOfFinding(catalog, finding.sourceId),
      rate: sourceOfFinding(catalog, finding.sourceId).value,
    })),
    [
      { subject: "S002", rate: 1.7 },
      { subject: "S003", rate: 1.7 },
      { subject: "scope", rate: 1.6 },
    ]
  );
});

test("anomaly count always outranks extreme z-score and sales-target gap", () => {
  const catalog = anomalyCatalog([
    ["S001", "两日异常店", 2, 0, 100, 100],
    ["S002", "单日极端异常店", 1, 2_001, -1_000_000_000, 100],
    ["S003", "零异常店", 0, 0, 100, 100],
  ]);
  const plan = buildInsightAttentionPlan({ intent: "anomaly_detection", catalog });

  assert.deepEqual(
    plan.findings.map((finding) => ({
      subject: subjectOfFinding(catalog, finding.sourceId),
      severity: finding.severity,
    })),
    [
      { subject: "S001", severity: "high" },
      { subject: "S002", severity: "medium" },
    ]
  );
});

test("zero anomaly days produce a healthy positive plan", () => {
  const catalog = anomalyCatalog([["S001", "零异常店", 0, 0, 100, 100]]);
  const plan = buildInsightAttentionPlan({ intent: "anomaly_detection", catalog });

  assert.equal(plan.status, "healthy");
  assert.equal(plan.findings[0]?.severity, "positive");
});

for (const intent of ["channel_mix", "daypart_analysis"] as const) {
  test(`${intent} includes the leading aggregate share and widest cross-store spread`, () => {
    const catalog = structureCatalog(intent, {
      aggregate: [["A", 60], ["B", 40]],
      stores: [
        ["S001", "A店", [["A", 90], ["B", 10]]],
        ["S002", "B店", [["A", 20], ["B", 80]]],
      ],
    });
    const plan = buildInsightAttentionPlan({ intent, catalog });
    const sources = plan.findings.map((finding) => sourceOfFinding(catalog, finding.sourceId));

    assert.deepEqual(
      sources.map((source) => [source.metricCode, source.subjectIds]),
      [
        [intent === "channel_mix" ? "channel_pct" : "daypart_pct", ["A"]],
        [intent === "channel_mix" ? "channel_value" : "daypart_value", ["S001", "A"]],
      ]
    );
    assert.ok(plan.findings.every((finding) => finding.severity === "low" && finding.confidence === "needs_verification"));
  });
}

test("promotion planning retains contribution, store spread, and promotion discount concentration", () => {
  const catalog = structureCatalog("promotion_contribution", {
    promotionDetails: [["会员券", 300], ["满减券", 100]],
    promotionStores: [
      ["S001", "A店", 60, 400],
      ["S002", "B店", 10, 40],
    ],
  });
  const plan = buildInsightAttentionPlan({ intent: "promotion_contribution", catalog });
  const sources = plan.findings.map((finding) => sourceOfFinding(catalog, finding.sourceId));

  assert.deepEqual(
    sources.map((source) => [source.metricCode, source.subjectIds]),
    [
      ["contribution_rate", []],
      ["store_contribution_rate", ["S001"]],
      ["promotion_value", ["会员券"]],
    ]
  );
  assert.ok(plan.findings.every((finding) => finding.severity === "low" && finding.confidence === "needs_verification"));
  assert.ok(plan.actionContexts.every((context) => context.mode === "verify"));
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

function refundCatalog(input: {
  overall: number;
  cancelOverall?: number;
  daily?: Array<[string, number]>;
  stores: Array<[string, string, number, number?]>;
}): InsightSourceCatalog {
  return buildInsightSourceCatalog({
    intent: "refund_rate",
    analysisData: {
      refundRate: input.overall,
      cancelRate: input.cancelOverall ?? 0,
      dailyRefund: (input.daily || []).map(([date, refundRate]) => ({ date, refundRate })),
      byStore: input.stores.map(([storeId, storeName, refundRate, cancelRate = 0]) => ({
        storeId,
        storeName,
        refundRate,
        cancelRate,
      })),
    },
  });
}

function anomalyCatalog(
  stores: Array<[string, string, number, number, number?, number?]>
): InsightSourceCatalog {
  return buildInsightSourceCatalog({
    intent: "anomaly_detection",
    analysisData: {
      stores: stores.map(([storeId, storeName, anomalyCount, zScore, actualSales = 80, salesTarget = 100]) => ({
        storeId,
        storeName,
        anomalyCount,
        anomalyDays: [{
          date: "2025-05-01",
          actualSales,
          salesTarget,
          zScore,
        }],
      })),
    },
  });
}

function structureCatalog(
  intent: "channel_mix" | "daypart_analysis" | "promotion_contribution",
  options: {
    aggregate?: Array<[string, number]>;
    stores?: Array<[string, string, Array<[string, number]>]>;
    promotionDetails?: Array<[string, number]>;
    promotionStores?: Array<[string, string, number, number]>;
  } = {}
): InsightSourceCatalog {
  if (intent === "promotion_contribution") {
    return buildInsightSourceCatalog({
      intent,
      analysisData: {
        contributionRate: 35,
        totalDiscount: 500,
        promotionDetails: (options.promotionDetails || [["会员券", 300]]).map(([promotionName, discountAmount]) => ({ promotionName, discountAmount })),
        byStore: (options.promotionStores || [["S001", "上海商场店", 40, 250]]).map(([storeId, storeName, contributionRate, totalDiscount]) => ({
          storeId,
          storeName,
          contributionRate,
          totalDiscount,
        })),
      },
    });
  }

  const dimension = intent === "channel_mix" ? "channel" : "daypart";
  const overallKey = intent === "channel_mix" ? "channelPct" : "daypartPct";
  const storeKey = intent === "channel_mix" ? "channels" : "dayparts";
  return buildInsightSourceCatalog({
    intent,
    analysisData: {
      [overallKey]: (options.aggregate || [["线上", 65], ["线下", 35]]).map(([name, salesPct]) => ({ [dimension]: name, salesPct })),
      byStore: (options.stores || [["S001", "上海商场店", [["线上", 650]]]]).map(([storeId, storeName, items]) => ({
        storeId,
        storeName,
        [storeKey]: items.map(([name, sales]) => ({ [dimension]: name, sales })),
      })),
    },
  });
}

function planFor(
  intent: "attribution" | "report" | "custom_metric",
  catalog: InsightSourceCatalog
) {
  activeMetricCatalog = catalog;
  return buildInsightAttentionPlan({ intent, catalog });
}

function attributionCatalog(
  contributions: Array<[string, number]>
): InsightSourceCatalog {
  const totalGap = contributions.reduce((sum, [, value]) => sum + value, 0);
  return buildInsightSourceCatalog({
    intent: "attribution",
    analysisData: {
      salesSummary: {
        totalSales: 960,
        totalTarget: 1_000,
        achievementRate: 96,
        totalOrders: 100,
        avgOrderValue: 9.6,
      },
      decomposition: {
        totalGap,
        orderVolumeGap: 0,
        aovGap: 0,
        interaction: 0,
      },
      factorContributions: contributions.map(([factor, contribution]) => ({
        factor,
        label: factor,
        contribution,
      })),
    },
  });
}

function sameScopeAttributionCatalog(options: {
  interaction?: number;
  positiveFactors?: string[];
} = {}): InsightSourceCatalog {
  return buildInsightSourceCatalog({
    intent: "attribution",
    analysisData: {
      salesSummary: {
        totalSales: 800,
        totalTarget: 1_000,
        achievementRate: 80,
        totalOrders: 80,
        avgOrderValue: 10,
      },
      decomposition: {
        totalGap: -200,
        orderVolumeGap: -120,
        aovGap: -80,
        interaction: options.interaction ?? 0,
      },
      factorContributions: (options.positiveFactors || []).map((factor, index) => ({
        factor,
        label: factor,
        contribution: 1_000 - index,
      })),
    },
  });
}

function reportCatalog(input: {
  overallRate: number;
  worstStoreRate: number;
  refundRate: number;
  anomalyCount: number;
}): InsightSourceCatalog {
  return buildInsightSourceCatalog({
    intent: "report",
    analysisData: {
      summary: {
        storeCount: 1,
        totalSales: 940,
        totalTarget: 1_000,
        achievementRate: input.overallRate,
        totalRefund: 24,
        refundRate: input.refundRate,
        totalOrders: 100,
        avgAOV: 9.4,
        totalCancelled: 0,
        totalPromo: 0,
        promoRate: 0,
      },
      storeRanking: [{
        storeId: "S001",
        storeName: "重点门店",
        totalSales: input.worstStoreRate,
        totalTarget: 100,
        achievementRate: input.worstStoreRate,
        salesRank: 1,
      }],
      dailyTrend: [{
        date: "2025-05-01",
        sales: 80,
        target: 100,
        orders: 10,
        avgAOV: 8,
        salesRankDesc: 1,
        salesRankAsc: 1,
        isAnomaly: input.anomalyCount,
        weekendAvg: 80,
        weekdayAvg: 80,
        weekendVs: 0,
      }],
    },
  });
}

function reportNoDataCatalog(): InsightSourceCatalog {
  return buildInsightSourceCatalog({
    intent: "report",
    analysisData: { recordCount: 0 },
  });
}

function customCatalog(value: number): InsightSourceCatalog {
  return buildInsightSourceCatalog({
    intent: "custom_metric",
    analysisData: { metric_value: value },
  });
}

function noDataCatalog(): InsightSourceCatalog {
  return buildInsightSourceCatalog({
    intent: "custom_metric",
    analysisData: { recordCount: 0 },
  });
}

function metricOfFinding(finding: { sourceId: string }): string {
  const source = activeMetricCatalog.findingSources.find((item) => item.id === finding.sourceId);
  assert.ok(source, `missing source ${finding.sourceId}`);
  if (source.metricCode === "factor_contribution") return source.subjectIds[0] || source.metricCode;
  if (source.metricCode === "achievement_rate" && source.attention.subjectKey !== "scope") {
    return "store_achievement_rate";
  }
  return source.metricCode;
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
