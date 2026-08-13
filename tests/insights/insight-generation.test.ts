import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisIntent } from "../../src/modules/domain/analysis-types";
import type { InsightDraft, InsightScope } from "../../src/modules/insights/insight-types";
import {
  buildInsightSourceCatalog,
  type InsightSourceCatalog,
} from "../../src/modules/insights/insight-source-catalog";
import { buildInsightEvidence } from "../../src/modules/insights/evidence-builder";
import { createInsightComposer } from "../../src/modules/insights/insight-composer";
import {
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
      { storeId: "S001", storeName: "东店", totalSales: 95000, totalTarget: 107710, achievementRate: "88.2", totalOrders: 1800, avgOrderValue: 52.78, totalRefund: 4100, totalCancelled: 27, refundRate: "4.3", channelBreakdown: { 堂食: 62000, 外卖: 33000 }, categoryBreakdown: { 正餐: 68000, 饮品: 27000 }, daypartBreakdown: { 午餐: 51000, 晚餐: 44000 }, dailySales: [{ date: "2026-08-01", actual_sales: 13000, sales_target: 15000 }] },
      { storeId: "S002", storeName: "西店", totalSales: 97000, totalTarget: 94083, achievementRate: "103.1", totalOrders: 1600, avgOrderValue: 60.63, totalRefund: 2100, totalCancelled: 14, refundRate: "2.2", channelBreakdown: { 堂食: 58000, 外卖: 39000 }, categoryBreakdown: { 正餐: 70000, 饮品: 27000 }, daypartBreakdown: { 午餐: 47000, 晚餐: 50000 }, dailySales: [{ date: "2026-08-01", actual_sales: 14500, sales_target: 14000 }] },
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
    { priority: "P0", title: "复盘门店执行", ownerRole: "杩愯惀", verificationMetricCode: "sales" },
    { priority: "P1", title: "跟进目标改善", ownerRole: "搴楅暱", verificationMetricCode: "achievement_rate" },
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
