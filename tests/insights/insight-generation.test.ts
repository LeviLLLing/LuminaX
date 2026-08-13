import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisIntent } from "../../src/modules/domain/analysis-types";
import { formatCompare } from "../../src/modules/chat/answer-formatters/compare";
import { COMPARE_SUMMARY_SQL } from "../../src/modules/metrics/sql/mysql-metric-queries";
import type { InsightDraft, InsightScope } from "../../src/modules/insights/insight-types";
import {
  buildInsightSourceCatalog,
  type InsightSourceCatalog,
} from "../../src/modules/insights/insight-source-catalog";
import { buildInsightEvidence } from "../../src/modules/insights/evidence-builder";
import { createInsightComposer } from "../../src/modules/insights/insight-composer";
import {
  containsNumericClaim,
  InsightValidationError,
  materializeInsightSnapshot,
} from "../../src/modules/insights/insight-validator";
import { FakeAgentModel } from "../fixtures/fake-agent-model";

const scope: InsightScope = {
  storeIds: ["S001", "S002"],
  startDate: "2026-08-01",
  endDate: "2026-08-07",
  comparisonLabel: "目标",
};

const fixtures: Record<string, Record<string, unknown>> = {
  order_trend: {
    dateRange: { start: "2026-08-01", end: "2026-08-07" },
    stores: [
      { storeId: "S001", storeName: "东店", totalOrders: 820, totalOrderTarget: 900, orderAchievementRate: 91.1, dailyOrders: [{ date: "2026-08-01", orders: 110, orderTarget: 120 }], trendDirection: "down", trendPct: -4.2 },
      { storeId: "S002", storeName: "西店", totalOrders: 940, totalOrderTarget: 910, orderAchievementRate: 103.3, dailyOrders: [{ date: "2026-08-01", orders: 130, orderTarget: 125 }], trendDirection: "up", trendPct: 2.8 },
    ],
  },
  aov_trend: {
    dateRange: { start: "2026-08-01", end: "2026-08-07" },
    stores: [
      { storeId: "S001", storeName: "东店", avgAOV: 46.25, targetAOV: 50, aovGap: -3.75, dailyAOV: [{ date: "2026-08-01", aov: 45.5, aovTarget: 50 }], trendDirection: "down", trendPct: -2.6 },
      { storeId: "S002", storeName: "西店", avgAOV: 52.4, targetAOV: 50, aovGap: 2.4, dailyAOV: [{ date: "2026-08-01", aov: 51.8, aovTarget: 50 }], trendDirection: "up", trendPct: 1.9 },
    ],
  },
  channel_mix: {
    dateRange: { start: "2026-08-01", end: "2026-08-07" },
    channelPct: [
      { channel: "堂食", sales: 120000, orders: 2100, salesPct: 62.5 },
      { channel: "外卖", sales: 72000, orders: 1300, salesPct: 37.5 },
    ],
    byStore: [
      { storeId: "S001", storeName: "东店", channels: [{ channel: "堂食", sales: 65000, orders: 1100, salesPct: 65 }] },
      { storeId: "S002", storeName: "西店", channels: [{ channel: "外卖", sales: 39000, orders: 720, salesPct: 40.2 }] },
    ],
  },
  daypart_analysis: {
    dateRange: { start: "2026-08-01", end: "2026-08-07" },
    daypartPct: [
      { daypart: "午餐", sales: 98000, orders: 1700, avgOrderValue: 57.65, salesPct: 51.1 },
      { daypart: "晚餐", sales: 94000, orders: 1600, avgOrderValue: 58.75, salesPct: 48.9 },
    ],
    byStore: [
      { storeId: "S001", storeName: "东店", dayparts: [{ daypart: "午餐", sales: 52000, orders: 900, avgOrderValue: 57.78, salesPct: 52 }] },
      { storeId: "S002", storeName: "西店", dayparts: [{ daypart: "晚餐", sales: 51000, orders: 860, avgOrderValue: 59.3, salesPct: 50.5 }] },
    ],
  },
  promotion_contribution: {
    dateRange: { start: "2026-08-01", end: "2026-08-07" }, totalSales: 192000, totalDiscount: 13500, totalPromoUnits: 780, contributionRate: 28.4,
    promotionDetails: [{ promotionName: "夏日套餐", discountAmount: 6200, promoUnits: 350, discountPct: 45.9 }],
    byStore: [
      { storeId: "S001", storeName: "东店", totalSales: 95000, totalDiscount: 7200, totalPromoUnits: 410, contributionRate: 31.2, promotions: [{ promotionName: "夏日套餐", discountAmount: 3900, promoUnits: 220 }] },
      { storeId: "S002", storeName: "西店", totalSales: 97000, totalDiscount: 6300, totalPromoUnits: 370, contributionRate: 25.8, promotions: [{ promotionName: "夏日套餐", discountAmount: 2300, promoUnits: 130 }] },
    ],
  },
  refund_rate: {
    dateRange: { start: "2026-08-01", end: "2026-08-07" }, totalSales: 192000, totalRefund: 6200, totalCancelled: 41, totalOrders: 3400, refundRate: 3.2, cancelRate: 1.2,
    dailyRefund: [{ date: "2026-08-03", refundAmount: 1400, cancelledOrders: 9, refundRate: 5.1, cancelRate: 2.2 }],
    byStore: [
      { storeId: "S001", storeName: "东店", totalSales: 95000, refundAmount: 4100, cancelledOrders: 27, refundRate: 4.3, cancelRate: 1.8 },
      { storeId: "S002", storeName: "西店", totalSales: 97000, refundAmount: 2100, cancelledOrders: 14, refundRate: 2.2, cancelRate: 0.7 },
    ],
  },
  anomaly_detection: {
    dateRange: { start: "2026-08-01", end: "2026-08-07" },
    stores: [
      { storeId: "S001", storeName: "东店", meanSales: 14200, stdDev: 1800, anomalyCount: 1, anomalyDays: [{ date: "2026-08-03", actualSales: 9200, salesTarget: 15000, achievementRate: 61.3, orderCount: 180, avgOrderValue: 51.1, refundAmount: 1200, cancelledOrders: 8, zScore: -2.78, isAnomaly: true, reasons: ["销售偏低"] }] },
      { storeId: "S002", storeName: "西店", meanSales: 14800, stdDev: 1600, anomalyCount: 1, anomalyDays: [{ date: "2026-08-05", actualSales: 19000, salesTarget: 15000, achievementRate: 126.7, orderCount: 350, avgOrderValue: 54.3, refundAmount: 300, cancelledOrders: 2, zScore: 2.63, isAnomaly: true, reasons: ["销售偏高"] }] },
    ],
  },
  compare: {
    dateRange: { start: "2026-08-01", end: "2026-08-07" },
    stores: [
      { storeId: "S001", storeName: "东店", totalSales: 95000, totalTarget: 107710, achievementRate: 88.2, totalOrders: 1800, avgOrderValue: 52.78, totalRefund: 4100, totalCancelled: 27, refundRate: 4.3, channelBreakdown: { 堂食: 62000, 外卖: 33000 }, categoryBreakdown: { 正餐: 68000, 饮品: 27000 }, daypartBreakdown: { 午餐: 51000, 晚餐: 44000 }, dailySales: [{ date: "2026-08-01", actual_sales: 13000, sales_target: 15000 }] },
      { storeId: "S002", storeName: "西店", totalSales: 97000, totalTarget: 94083, achievementRate: 103.1, totalOrders: 1600, avgOrderValue: 60.63, totalRefund: 2100, totalCancelled: 14, refundRate: 2.2, channelBreakdown: { 堂食: 58000, 外卖: 39000 }, categoryBreakdown: { 正餐: 70000, 饮品: 27000 }, daypartBreakdown: { 午餐: 47000, 晚餐: 50000 }, dailySales: [{ date: "2026-08-01", actual_sales: 14500, sales_target: 14000 }] },
    ], anomalies: [],
  },
  attribution: {
    dateRange: { start: "2026-08-01", end: "2026-08-07" }, storeIds: ["S001", "S002"], storeNames: { S001: "东店", S002: "西店" },
    salesSummary: { totalSales: 192000, totalTarget: 201793, achievementRate: 95.1, totalOrders: 3400, avgOrderValue: 56.47 },
    dailyDetail: [{ date: "2026-08-03", actualSales: 24100, salesTarget: 29000, achievementRate: 83.1, orderCount: 420, avgOrderValue: 57.38 }],
    orderVsAov: { avgDailySales: 28800, avgDailyOrders: 510, avgAOV: 56.47, actualDailySales: 27428.57, actualDailyOrders: 485.71, salesDrop: -1371.43, ordersDrop: -24.29, aovDrop: 0, mainIssue: "orders" },
    channelBreakdown: { 堂食: 120000, 外卖: 72000 }, categoryBreakdown: { 正餐: 138000, 饮品: 54000 }, daypartBreakdown: { 午餐: 98000, 晚餐: 94000 }, channelDaily: [],
    refundSummary: { totalRefund: 6200, totalCancelled: 41, refundRate: 3.2 }, refundDaily: [], refundByStore: [{ storeId: "S001", storeName: "东店", refundAmount: 4100, cancelledOrders: 27, refundRate: 4.3 }], managerFeedback: [], promotionSummary: { totalDiscount: 13500, totalPromoUnits: 780, promoCount: 2, topPromotions: [{ promotion_name: "夏日套餐", promo_sales: 36000, promo_orders: 620 }] },
    benchmark: { type: "target", label: "销售目标", window: null },
    decomposition: { totalGap: -9793, orderVolumeGap: -8200, aovGap: -1100, interaction: -493, dimensionContributions: [{ dimension: "channel", name: "外卖", contribution: -4500, share: 45.95 }, { dimension: "category", name: "饮品", contribution: -3100, share: 31.66 }, { dimension: "daypart", name: "晚餐", contribution: -2193, share: 22.39 }] },
    factorContributions: [{ factor: "order_volume", label: "订单量", contribution: -8200, direction: "down", benchmark: "销售目标", evidence: "订单量低于基准", confidence: "high" }], feedbackSignals: [],
  },
};

const expectedCatalog = [
  ["order_trend", ["period_variance", "metric_drivers"], ["total_orders", "order_achievement_rate", "trend_pct"]],
  ["aov_trend", ["period_variance", "metric_drivers"], ["avg_aov", "target_aov", "aov_gap", "trend_pct"]],
  ["channel_mix", ["channel_contribution"], ["channel_pct", "channel_value"]],
  ["daypart_analysis", ["daypart_contribution"], ["daypart_pct", "daypart_value"]],
  ["promotion_contribution", ["metric_drivers", "store_target_variance"], ["contribution_rate", "total_discount", "promotion_value", "store_contribution_rate"]],
  ["refund_rate", ["metric_drivers", "anomaly_dates"], ["refund_rate", "cancel_rate", "daily_refund_rate", "store_refund_rate"]],
  ["anomaly_detection", ["anomaly_dates", "metric_drivers"], ["anomaly_count", "anomaly_day"]],
  ["compare", ["store_target_variance", "channel_contribution", "category_contribution", "daypart_contribution"], ["sales", "target", "orders", "aov", "refund"]],
  ["attribution", ["period_variance", "metric_drivers", "channel_contribution", "category_contribution", "daypart_contribution", "store_target_variance"], ["sales_summary", "decomposition", "factor_contribution", "dimension_contribution"]],
] as const;

for (const [intent, evidenceTypes, metricCodes] of expectedCatalog) {
  test(`${intent} maps its fixed SQL shape into authoritative sources`, () => {
    const catalog = buildInsightSourceCatalog({ intent, analysisData: fixtures[intent] });
    assert.ok(metricCodes.every((code) => catalog.findingSources.some((item) => item.metricCode === code)), `missing metric code for ${intent}`);
    assert.deepEqual([...new Set(catalog.evidenceCandidates.map((item) => item.type))].sort(), [...evidenceTypes].sort());
    assert.ok(catalog.findingSources.every((item) => Number.isFinite(item.value)));
    assert.ok(catalog.evidenceCandidates.every((item) => item.series.length > 0 && item.series.every((series) => Number.isFinite(series.value))));
    assert.ok(catalog.evidenceCandidates.every((item) => item.interpretationFacts.length > 0));
    assert.ok(catalog.findingSources.every((source) => source.evidenceCandidateIds.some((id) => {
      const candidate = catalog.evidenceCandidates.find((item) => item.id === id);
      return candidate?.series.some((series) => series.value === source.value || series.baseline === source.value);
    })), `source without matching evidence for ${intent}`);
  });
}

test("all nine catalogs preserve representative SQL paths exactly", () => {
  const cases = [
    ["order_trend", "total_orders", 820, "count", ["S001"], "period_variance", "count", [820], [900]],
    ["aov_trend", "avg_aov", 46.25, "currency", ["S001"], "period_variance", "currency", [46.25], [50]],
    ["channel_mix", "channel_pct", 62.5, "percentage", ["堂食"], "channel_contribution", "percentage", [62.5, 37.5], []],
    ["daypart_analysis", "daypart_pct", 51.1, "percentage", ["午餐"], "daypart_contribution", "percentage", [51.1, 48.9], []],
    ["promotion_contribution", "contribution_rate", 28.4, "percentage", [], "metric_drivers", "percentage", [28.4], []],
    ["refund_rate", "daily_refund_rate", 5.1, "percentage", ["2026-08-03"], "anomaly_dates", "percentage", [5.1], []],
    ["anomaly_detection", "anomaly_day", 9200, "currency", ["S001", "2026-08-03"], "anomaly_dates", "currency", [9200], [15000]],
    ["compare", "achievement_rate", 88.2, "percentage", ["S001"], "store_target_variance", "percentage", [88.2, 103.1], []],
    ["attribution", "sales_summary", 192000, "currency", [], "period_variance", "currency", [192000], [201793]],
  ] as const;

  for (const [intent, metricCode, value, unit, subjectIds, evidenceType, evidenceUnit, values, baselines] of cases) {
    const catalog = buildInsightSourceCatalog({ intent, analysisData: fixtures[intent] });
    const source = catalog.findingSources.find((item) => item.metricCode === metricCode && item.value === value);
    assert.ok(source, `missing exact source for ${intent}`);
    assert.equal(source.unit, unit);
    assert.deepEqual(source.subjectIds, subjectIds);
    const candidate = catalog.evidenceCandidates.find((item) => source.evidenceCandidateIds.includes(item.id) && item.type === evidenceType);
    assert.ok(candidate, `missing exact evidence for ${intent}`);
    assert.equal(candidate.unit, evidenceUnit);
    assert.deepEqual(candidate.series.map((item) => item.value), values);
    assert.deepEqual(candidate.series.flatMap((item) => item.baseline === undefined ? [] : [item.baseline]), baselines);
  }
});

test("anomaly sales findings do not claim z-score evidence support", () => {
  const catalog = buildInsightSourceCatalog({ intent: "anomaly_detection", analysisData: fixtures.anomaly_detection });
  const source = catalog.findingSources.find((item) => item.value === 9200);
  assert.ok(source);
  assert.deepEqual(source.evidenceCandidateIds.map((id) => catalog.evidenceCandidates.find((item) => item.id === id)?.unit), ["currency"]);
});

test("stable IDs disambiguate raw identities that share a readable slug", () => {
  const catalog = buildInsightSourceCatalog({
    intent: "channel_mix",
    analysisData: {
      channelPct: [
        { channel: "A/B", sales: 30, orders: 3, salesPct: 30 },
        { channel: "A-B", sales: 70, orders: 7, salesPct: 70 },
      ],
      byStore: [{ storeId: "S001", storeName: "东店", channels: [{ channel: "A/B", sales: 30, orders: 3, salesPct: 30 }, { channel: "A-B", sales: 70, orders: 7, salesPct: 70 }] }],
    },
  });
  const sources = catalog.findingSources.filter((item) => item.metricCode === "channel_pct");
  assert.equal(new Set(sources.map((item) => item.id)).size, 2);
  const series = catalog.evidenceCandidates.find((item) => item.unit === "percentage")?.series || [];
  assert.equal(new Set(series.map((item) => item.key)).size, 2);
  assert.match(sources[0].id, /a-b-[a-f0-9]{8}$/);
});

test("invalid identities are skipped without fabricating labels", () => {
  const data = structuredClone(fixtures.order_trend) as { stores: Array<Record<string, unknown>> };
  data.stores.unshift({ storeId: " ", storeName: "", totalOrders: 999, totalOrderTarget: 1000, orderAchievementRate: 99.9, trendPct: 1 });
  data.stores.push(null as unknown as Record<string, unknown>);
  const catalog = buildInsightSourceCatalog({ intent: "order_trend", analysisData: data as unknown as Record<string, unknown> });
  assert.equal(catalog.findingSources.some((item) => item.value === 999), false);
  assert.equal(catalog.findingSources.some((item) => item.subjectIds.includes("overall")), false);
  assert.throws(() => buildInsightSourceCatalog({ intent: "order_trend", analysisData: { stores: [{ totalOrders: 1, totalOrderTarget: 1, orderAchievementRate: 100, trendPct: 0 }] } }), InsightValidationError);
});

test("attribution top-level breakdowns remain authoritative without decomposition dimensions", () => {
  const data = structuredClone(fixtures.attribution) as Record<string, unknown> & { decomposition: { dimensionContributions: unknown[] } };
  data.decomposition.dimensionContributions = [];
  const catalog = buildInsightSourceCatalog({ intent: "attribution", analysisData: data });
  for (const [metricCode, value, type, subject] of [
    ["channel_contribution", 120000, "channel_contribution", "堂食"],
    ["category_contribution", 138000, "category_contribution", "正餐"],
    ["daypart_contribution", 98000, "daypart_contribution", "午餐"],
  ] as const) {
    const source = catalog.findingSources.find((item) => item.metricCode === metricCode && item.value === value);
    assert.ok(source);
    assert.deepEqual(source.subjectIds, [subject]);
    const evidence = catalog.evidenceCandidates.find((item) => source.evidenceCandidateIds.includes(item.id));
    assert.equal(evidence?.type, type);
    assert.equal(evidence?.unit, "currency");
  }
});

test("compare uses numeric SQL rates in evidence and presentation", () => {
  const catalog = buildInsightSourceCatalog({ intent: "compare", analysisData: fixtures.compare });
  assert.deepEqual(catalog.findingSources.filter((item) => item.metricCode === "achievement_rate").map((item) => item.value), [88.2, 103.1]);
  assert.deepEqual(catalog.findingSources.filter((item) => item.metricCode === "refund_rate").map((item) => item.value), [4.3, 2.2]);
  const formatted = formatCompare(fixtures.compare);
  assert.match(formatted, /88\.20%/);
  assert.match(formatted, /4\.30%/);
});

test("compare SQL returns numeric rate aliases without presentation strings", () => {
  const expectedNumerators = {
    achievementRate: /ROUND\(\s*COALESCE\(sales\.total_sales,\s*0\)\s*\/\s*targets\.total_target\s*\*\s*100,\s*1\s*\)/i,
    refundRate: /ROUND\(\s*COALESCE\(refunds\.total_refund,\s*0\)\s*\/\s*sales\.total_sales\s*\*\s*100,\s*2\s*\)/i,
  } as const;

  for (const alias of ["achievementRate", "refundRate"] as const) {
    const match = COMPARE_SUMMARY_SQL.match(
      new RegExp(`CASE([\\s\\S]*?)END\\s+AS\\s+${alias}`, "i")
    );
    assert.ok(match, `missing CASE expression for ${alias}`);
    assert.match(match[0], /ELSE\s+0\s+END/i);
    assert.match(match[0], expectedNumerators[alias]);
    assert.doesNotMatch(match[0], /CONCAT|['"]%['"]|N\/A/i);
  }
});

test("numeric prose rejects Chinese percentage expressions without overmatching", () => {
  assert.equal(containsNumericClaim("销售下降百分之三"), true);
  assert.equal(containsNumericClaim("退款率上升百分之十二点五"), true);
  assert.equal(containsNumericClaim("百分比口径需要统一"), false);
});

test("numeric strings, missing values, NaN, and infinities are skipped", () => {
  const data = structuredClone(fixtures.compare) as { stores: Array<Record<string, unknown>> };
  data.stores[0].achievementRate = "88.2";
  data.stores[0].totalOrders = Number.NaN;
  data.stores[0].avgOrderValue = Number.POSITIVE_INFINITY;
  data.stores[0].totalRefund = undefined;
  const catalog = buildInsightSourceCatalog({ intent: "compare", analysisData: data });
  const firstStore = catalog.findingSources.filter((item) => item.subjectIds.includes("S001"));
  assert.equal(firstStore.some((item) => item.metricCode === "achievement_rate"), false);
  assert.equal(firstStore.some((item) => item.metricCode === "orders"), false);
  assert.equal(firstStore.some((item) => item.metricCode === "aov"), false);
  assert.equal(firstStore.some((item) => item.metricCode === "refund"), false);
});

test("compare data becomes store variance and contribution evidence", () => {
  const catalog = buildInsightSourceCatalog({ intent: "compare", analysisData: fixtures.compare });
  assert.ok(catalog.findingSources.some((item) => item.metricCode === "sales"));
  assert.ok(catalog.evidenceCandidates.some((item) => item.type === "store_target_variance"));
  assert.ok(catalog.evidenceCandidates.some((item) => item.type === "category_contribution"));
});

test("evidence values are copied from SQL data and never from the draft", () => {
  const catalog = buildInsightSourceCatalog({ intent: "compare", analysisData: fixtures.compare });
  const candidate = catalog.evidenceCandidates.find((item) => item.type === "store_target_variance");
  assert.ok(candidate);
  const evidence = buildInsightEvidence([candidate], [{ findingId: "finding-1", evidenceIds: [candidate.id] }]);
  assert.deepEqual(evidence[0].series.map((item) => item.value), [95000, 97000]);
  assert.equal(evidence[0].supportsFindingIds[0], "finding-1");
  assert.equal(evidence[0].interpretation, candidate.interpretationFacts.join("；"));
});

const compareCatalog = buildInsightSourceCatalog({ intent: "compare", analysisData: fixtures.compare });
const sourceIds = compareCatalog.findingSources.slice(0, 3).map((item) => item.id);
const validDraft: InsightDraft = {
  headline: "门店表现分化需跟进",
  findings: sourceIds.map((sourceId, index) => ({ sourceId, title: ["门店表现承压", "目标差距明显", "结构贡献分化"][index], summary: ["需要关注目标完成情况", "建议核查执行差异", "贡献结构值得持续观察"][index], severity: index === 2 ? "medium" : "high", confidence: "high", evidenceIds: [compareCatalog.findingSources[index].evidenceCandidateIds[0]] })),
  verificationItems: [],
  actions: [
    { priority: "P0", title: "复盘门店执行", ownerRole: "运营", verificationMetricCode: "sales" },
    { priority: "P1", title: "跟进目标改善", ownerRole: "店长", verificationMetricCode: "achievement_rate" },
  ],
};

test("composer has no memory and returns only a bounded draft", async () => {
  const model = new FakeAgentModel("deepseek", () => JSON.stringify(validDraft));
  const composer = createInsightComposer({ model });
  const result = await composer.compose({ question: "比较门店", intent: "compare", scope, catalog: compareCatalog, attributionNarrative: "订单贡献偏弱" });
  assert.equal(result.findings.length, 3);
  assert.equal(model.requests.length, 1);
  assert.equal(model.requests[0].temperature, 0.1);
  assert.equal(model.requests[0].messages.length, 1);
  assert.match(model.requests[0].messages[0].content, /订单贡献偏弱/);
  assert.doesNotMatch(model.requests[0].messages[0].content, /select\s|password|credential/i);
});

test("composer rejects invalid JSON and out-of-bounds drafts", async () => {
  const invalidJson = createInsightComposer({ model: new FakeAgentModel("deepseek", () => "not json") });
  await assert.rejects(() => invalidJson.compose({ question: "比较门店", intent: "compare", scope, catalog: compareCatalog }), (error: unknown) => error instanceof InsightValidationError && error.code === "INVALID_MODEL_OUTPUT");
  const tooShort = createInsightComposer({ model: new FakeAgentModel("deepseek", () => JSON.stringify({ ...validDraft, findings: validDraft.findings.slice(0, 2) })) });
  await assert.rejects(() => tooShort.compose({ question: "比较门店", intent: "compare", scope, catalog: compareCatalog }), InsightValidationError);
});

const materializeInput = {
  userId: "user-1",
  question: "比较门店",
  intent: "compare" as const,
  scope,
  catalog: compareCatalog,
  draft: validDraft,
  accessRequirements: [{ tableName: "sales_daily", columns: ["store_id", "actual_sales"] }],
  now: () => new Date("2026-08-13T10:00:00.000Z"),
  randomUUID: (() => { let next = 0; return () => `uuid-${++next}`; })(),
};

test("materialization copies source facts, links evidence, and initializes actions", () => {
  const snapshot = materializeInsightSnapshot(materializeInput);
  assert.equal(snapshot.findings[0].value, compareCatalog.findingSources[0].value);
  assert.equal(snapshot.findings[0].displayValue, compareCatalog.findingSources[0].displayValue);
  assert.ok(snapshot.evidence.every((item) => item.supportsFindingIds.length > 0));
  assert.ok(snapshot.actions.every((item) => item.completed === false && item.completedAt === null));
  assert.equal(snapshot.createdAt, "2026-08-13T10:00:00.000Z");
  assert.equal(snapshot.updatedAt, snapshot.createdAt);
});

test("model-authored numeric claims and unknown IDs reject the snapshot", () => {
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, draft: { ...validDraft, headline: "销售下降20%" } }), InsightValidationError);
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, draft: { ...validDraft, headline: "销售下降二成" } }), InsightValidationError);
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, draft: { ...validDraft, findings: [{ ...validDraft.findings[0], sourceId: "unknown" }, ...validDraft.findings.slice(1)] } }), InsightValidationError);
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, draft: { ...validDraft, findings: [{ ...validDraft.findings[0], evidenceIds: ["unknown"] }, ...validDraft.findings.slice(1)] } }), InsightValidationError);
});

test("empty evidence, unsupported numeric prose, and bad reference cardinality reject", () => {
  const emptyCatalog: InsightSourceCatalog = { ...compareCatalog, evidenceCandidates: compareCatalog.evidenceCandidates.map((item, index) => index === 0 ? { ...item, series: [] } : item) };
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, catalog: emptyCatalog }), InsightValidationError);
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, draft: { ...validDraft, actions: [{ ...validDraft.actions[0], title: "跟进第十门店" }, validDraft.actions[1]] } }), InsightValidationError);
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, draft: { ...validDraft, findings: validDraft.findings.map((item, index) => index === 0 ? { ...item, evidenceIds: [] } : item) } }), InsightValidationError);
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, draft: { ...validDraft, findings: [validDraft.findings[0], validDraft.findings[0], validDraft.findings[2]] } }), InsightValidationError);
});

test("materialization rejects non-finite catalog facts", () => {
  const badSourceCatalog: InsightSourceCatalog = {
    ...compareCatalog,
    findingSources: compareCatalog.findingSources.map((item, index) => index === 0 ? { ...item, value: Number.NaN } : item),
  };
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, catalog: badSourceCatalog }), InsightValidationError);
  const badSeriesCatalog: InsightSourceCatalog = {
    ...compareCatalog,
    evidenceCandidates: compareCatalog.evidenceCandidates.map((item, index) => index === 0 ? { ...item, series: item.series.map((series, seriesIndex) => seriesIndex === 0 ? { ...series, value: Number.POSITIVE_INFINITY } : series) } : item),
  };
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, catalog: badSeriesCatalog }), InsightValidationError);
});

test("materialization rejects duplicate catalog IDs and unsupported evidence facts", () => {
  const duplicateSources: InsightSourceCatalog = { ...compareCatalog, findingSources: [...compareCatalog.findingSources, { ...compareCatalog.findingSources[0] }] };
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, catalog: duplicateSources }), (error: unknown) => error instanceof InsightValidationError && error.code === "DUPLICATE_SOURCE_ID");
  const duplicateEvidence: InsightSourceCatalog = { ...compareCatalog, evidenceCandidates: [...compareCatalog.evidenceCandidates, { ...compareCatalog.evidenceCandidates[0] }] };
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, catalog: duplicateEvidence }), (error: unknown) => error instanceof InsightValidationError && error.code === "DUPLICATE_EVIDENCE_ID");

  const firstSource = compareCatalog.findingSources[0];
  const unrelated = compareCatalog.evidenceCandidates.find((item) =>
    item.unit === firstSource.unit &&
    !item.series.some((series) => series.value === firstSource.value || series.baseline === firstSource.value)
  )!;
  const maliciousCatalog: InsightSourceCatalog = {
    ...compareCatalog,
    findingSources: compareCatalog.findingSources.map((item) => item.id === firstSource.id ? { ...item, evidenceCandidateIds: [unrelated.id] } : item),
  };
  const maliciousDraft: InsightDraft = {
    ...validDraft,
    findings: validDraft.findings.map((item) => item.sourceId === firstSource.id ? { ...item, evidenceIds: [unrelated.id] } : item),
  };
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, catalog: maliciousCatalog, draft: maliciousDraft }), (error: unknown) => error instanceof InsightValidationError && error.code === "UNSUPPORTED_EVIDENCE_FACT");
});

test("verification references must resolve and observed facts still need evidence", () => {
  const draft: InsightDraft = { ...validDraft, verificationItems: [{ observedFact: "现场执行存疑", hypothesis: "可能存在执行偏差", requiredCheck: "核查排班记录" }] };
  const snapshot = materializeInsightSnapshot({ ...materializeInput, draft });
  assert.equal(snapshot.verificationItems.length, 1);
  assert.throws(() => materializeInsightSnapshot({ ...materializeInput, draft: { ...draft, actions: [{ ...draft.actions[0], verificationMetricCode: "unknown" }, draft.actions[1]] } }), InsightValidationError);
});

test("fingerprint and formatting are deterministic and exclude question and prose", () => {
  const first = materializeInsightSnapshot(materializeInput);
  const reordered = materializeInsightSnapshot({ ...materializeInput, question: "另一个问题", scope: { ...scope, storeIds: [...scope.storeIds].reverse() }, draft: { ...validDraft, headline: "经营表现需要持续关注" }, randomUUID: () => "other-id" });
  assert.equal(first.sourceFingerprint, reordered.sourceFingerprint);
  assert.match(first.sourceFingerprint, /^[a-f0-9]{64}$/);
  assert.ok(compareCatalog.findingSources.some((item) => item.unit === "currency" && item.displayValue === "¥95,000"));
  assert.ok(compareCatalog.findingSources.some((item) => item.unit === "count" && item.displayValue === "1,800"));
  const rate = buildInsightSourceCatalog({ intent: "refund_rate", analysisData: fixtures.refund_rate }).findingSources.find((item) => item.metricCode === "refund_rate");
  assert.equal(rate?.displayValue, "3.2%");
  assert.ok(compareCatalog.evidenceCandidates.some((item) => item.interpretationFacts.includes("东店为¥95,000")));
});

test("catalog rejects insufficient authoritative material", () => {
  assert.throws(() => buildInsightSourceCatalog({ intent: "compare", analysisData: { stores: [] } }), InsightValidationError);
  assert.throws(() => buildInsightSourceCatalog({ intent: "achievement_rate" as AnalysisIntent, analysisData: fixtures.compare }), InsightValidationError);
});
