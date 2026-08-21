import { createHash } from "node:crypto";
import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import type {
  InsightEvidenceSeries,
  InsightEvidenceType,
} from "./insight-types";
import { InsightValidationError } from "./insight-validator";

export interface InsightFindingSource {
  id: string;
  metricCode: string;
  label: string;
  value: number;
  unit: string;
  displayValue: string;
  subjectIds: string[];
  evidenceCandidateIds: string[];
  attention: InsightSourceAttentionMetadata;
}

export interface InsightSourceAttentionMetadata {
  subjectKey: string;
  role: "primary" | "support";
  signal:
    | "achievement"
    | "trend"
    | "risk_rate"
    | "anomaly"
    | "structure"
    | "contribution"
    | "data_availability"
    | "neutral";
  benchmark?: number;
  delta?: number;
}

export interface InsightEvidenceCandidate {
  id: string;
  type: InsightEvidenceType;
  title: string;
  unit: string;
  baselineLabel: string;
  series: InsightEvidenceSeries[];
  interpretationFacts: string[];
}

export interface InsightEvidenceLink {
  findingId: string;
  evidenceIds: string[];
}

export interface InsightSourceCatalog {
  findingSources: InsightFindingSource[];
  evidenceCandidates: InsightEvidenceCandidate[];
  verificationMetricLabels: Record<string, string>;
}

interface CatalogInput {
  intent: AnalysisIntent;
  analysisData: Record<string, unknown>;
}

type Unit = "currency" | "percentage" | "count" | "ratio";
type UnknownRecord = Record<string, unknown>;

const verificationMetricLabels: Record<string, string> = {
  sales: "销售额",
  target: "销售目标",
  achievement_rate: "目标达成率",
  orders: "订单量",
  order_achievement_rate: "订单目标达成率",
  aov: "客单价",
  refund: "退款额",
  refund_rate: "退款率",
  cancel_rate: "取消率",
  contribution_rate: "贡献率",
  trend_pct: "趋势变化率",
};

const genericMetricDefinitions: Record<
  string,
  { code: string; label: string; unit: Unit }
> = {
  totalSales: { code: "sales", label: "销售额", unit: "currency" },
  totalTarget: { code: "target", label: "销售目标", unit: "currency" },
  gap: { code: "sales_gap", label: "销售目标差额", unit: "currency" },
  achievementRate: {
    code: "achievement_rate",
    label: "目标达成率",
    unit: "percentage",
  },
  totalOrders: { code: "orders", label: "订单量", unit: "count" },
  avgAOV: { code: "aov", label: "平均客单价", unit: "currency" },
  totalRefund: { code: "refund", label: "退款额", unit: "currency" },
  refundRate: { code: "refund_rate", label: "退款率", unit: "percentage" },
  cancelRate: { code: "cancel_rate", label: "取消率", unit: "percentage" },
  recordCount: {
    code: "data_availability",
    label: "可用数据记录数",
    unit: "count",
  },
  metric_value: { code: "custom_metric_value", label: "指标值", unit: "count" },
};

const genericMetadataKeys = new Set([
  "id",
  "code",
  "description",
  "precision",
  "rowCount",
  "storeId",
  "storeName",
]);

export function buildInsightSourceCatalog(input: CatalogInput): InsightSourceCatalog {
  const builder = new CatalogBuilder(input.intent);
  switch (input.intent) {
    case "order_trend":
      buildOrderTrend(builder, input.analysisData);
      break;
    case "aov_trend":
      buildAovTrend(builder, input.analysisData);
      break;
    case "channel_mix":
      buildMix(builder, input.analysisData, "channel");
      break;
    case "daypart_analysis":
      buildMix(builder, input.analysisData, "daypart");
      break;
    case "promotion_contribution":
      buildPromotion(builder, input.analysisData);
      break;
    case "refund_rate":
      buildRefund(builder, input.analysisData);
      break;
    case "anomaly_detection":
      buildAnomaly(builder, input.analysisData);
      break;
    case "compare":
      buildCompare(builder, input.analysisData);
      break;
    case "attribution":
      buildAttribution(builder, input.analysisData);
      break;
    case "achievement_rate":
      buildAchievementRate(builder, input.analysisData);
      break;
    case "report":
      buildReport(builder, input.analysisData);
      break;
    case "custom_metric":
      buildGeneric(builder, input.analysisData);
      break;
    case "irrelevant":
      throw new InsightValidationError("INSUFFICIENT_SOURCE_DATA");
    default: {
      const exhaustive: never = input.intent;
      throw new InsightValidationError("UNSUPPORTED_INTENT", String(exhaustive));
    }
  }

  const catalog = builder.build();
  if (
    catalog.findingSources.length === 0 ||
    !catalog.evidenceCandidates.some((candidate) => candidate.series.length > 0)
  ) {
    throw new InsightValidationError("INSUFFICIENT_SOURCE_DATA");
  }
  return catalog;
}

class CatalogBuilder {
  readonly findingSources: InsightFindingSource[] = [];
  readonly evidenceCandidates: InsightEvidenceCandidate[] = [];
  private readonly verificationLabels = { ...verificationMetricLabels };

  constructor(private readonly intent: AnalysisIntent) {}

  evidence(
    path: string,
    type: InsightEvidenceType,
    title: string,
    unit: Unit,
    baselineLabel: string,
    series: Array<InsightEvidenceSeries | null>,
    facts: string[] = []
  ): string | null {
    const finiteSeries = series.filter(
      (item): item is InsightEvidenceSeries =>
        Boolean(item) &&
        Number.isFinite(item?.value) &&
        (item?.baseline === undefined || Number.isFinite(item.baseline))
    );
    if (finiteSeries.length === 0) return null;
    const id = stableId(this.intent, path);
    this.evidenceCandidates.push({
      id,
      type,
      title,
      unit,
      baselineLabel,
      series: finiteSeries,
      interpretationFacts: facts.length > 0
        ? facts
        : finiteSeries.map((item) => `${item.label}为${formatValue(item.value, unit)}`),
    });
    return id;
  }

  source(
    path: string,
    metricCode: string,
    label: string,
    value: unknown,
    unit: Unit,
    subjectIds: string[],
    evidenceIds: Array<string | null>,
    attention: InsightSourceAttentionMetadata
  ): void {
    if (!isFiniteNumber(value)) return;
    this.verificationLabels[metricCode] ||= label;
    this.findingSources.push({
      id: stableId(this.intent, path, ...subjectIds),
      metricCode,
      label,
      value,
      unit,
      displayValue: formatValue(value, unit),
      subjectIds: [...subjectIds],
      evidenceCandidateIds: evidenceIds.filter((id): id is string => Boolean(id)),
      attention,
    });
  }

  build(): InsightSourceCatalog {
    return {
      findingSources: this.findingSources,
      evidenceCandidates: this.evidenceCandidates,
      verificationMetricLabels: { ...this.verificationLabels },
    };
  }
}

interface GenericNumericFact {
  path: string;
  key: string;
  value: number;
  subject: { id: string; label: string } | null;
}

function buildGeneric(builder: CatalogBuilder, data: UnknownRecord): void {
  for (const fact of collectGenericNumericFacts(data)) {
    const definition = genericMetricDefinitions[fact.key] || {
      code: `generic_${fact.path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
      label: humanizeMetricKey(fact.key),
      unit: inferGenericUnit(fact.key),
    };
    const label = fact.subject
      ? `${fact.subject.label}${definition.label}`
      : definition.label;
    const evidence = builder.evidence(
      fact.path,
      "metric_drivers",
      label,
      definition.unit,
      "固定 SQL 结果",
      [series(label, fact.value)]
    );
    builder.source(
      fact.path,
      definition.code,
      label,
      fact.value,
      definition.unit,
      fact.subject ? [fact.subject.id] : [],
      [evidence],
      attentionMetadata(
        fact.subject?.id || "scope",
        "primary",
        definition.code === "data_availability" ? "data_availability" : "neutral"
      )
    );
  }
}

function buildAchievementRate(builder: CatalogBuilder, data: UnknownRecord): void {
  const overall = record(data.overall);
  const overallSales = numberValue(overall.totalSales);
  const overallTarget = numberValue(overall.totalTarget);
  const overallGap = numberValue(overall.gap);
  const overallRate = numberValue(overall.achievementRate);
  const overallPerformance = builder.evidence(
    "overall.performance",
    "period_variance",
    "整体目标表现",
    "currency",
    "销售目标",
    [series("整体销售额", overall.totalSales, overall.totalTarget)]
  );
  const overallGapEvidence = builder.evidence(
    "overall.gap",
    "metric_drivers",
    "整体销售目标差额",
    "currency",
    "销售目标差额",
    [series("整体销售目标差额", overall.gap)]
  );
  const overallRateEvidence = builder.evidence(
    "overall.achievementRate",
    "period_variance",
    "整体目标达成率",
    "percentage",
    "目标达成率",
    [series("整体目标达成率", overall.achievementRate)]
  );
  builder.source("overall.totalSales", "sales", "整体销售额", overall.totalSales, "currency", [], [overallPerformance], attentionMetadata("scope", "support", "achievement", overallTarget ?? undefined, overallSales === null || overallTarget === null ? undefined : overallSales - overallTarget));
  builder.source("overall.totalTarget", "target", "整体销售目标", overall.totalTarget, "currency", [], [overallPerformance], attentionMetadata("scope", "support", "achievement"));
  builder.source("overall.gap", "sales_gap", "整体销售目标差额", overall.gap, "currency", [], [overallGapEvidence], attentionMetadata("scope", "support", "achievement", 0, overallGap ?? undefined));
  builder.source("overall.achievementRate", "achievement_rate", "整体目标达成率", overall.achievementRate, "percentage", [], [overallRateEvidence], attentionMetadata("scope", "primary", "achievement", 100, overallRate === null ? undefined : overallRate - 100));

  const stores = records(data.stores).flatMap((store) => {
    const subject = subjectOf(store, "storeId", "storeName");
    return subject ? [{ store, subject }] : [];
  });
  const rateEvidence = builder.evidence(
    "stores.achievementRate",
    "store_target_variance",
    "门店目标达成率",
    "percentage",
    "目标达成率",
    stores.map(({ store, subject }) => series(subject.label, store.achievementRate))
  );

  for (const { store, subject } of stores) {
    const performance = builder.evidence(
      `stores.${subject.id}.performance`,
      "store_target_variance",
      `${subject.label}目标表现`,
      "currency",
      "销售目标",
      [series(subject.label, store.totalSales, store.totalTarget), series("目标差额", store.gap)]
    );
    const gapEvidence = builder.evidence(
      `stores.${subject.id}.gap`,
      "metric_drivers",
      `${subject.label}销售目标差额`,
      "currency",
      "销售目标差额",
      [series("销售目标差额", store.gap)]
    );
    const rate = numberValue(store.achievementRate);
    const sales = numberValue(store.totalSales);
    const target = numberValue(store.totalTarget);
    const gap = numberValue(store.gap);
    builder.source("stores.achievementRate", "achievement_rate", `${subject.label}目标达成率`, store.achievementRate, "percentage", [subject.id], [rateEvidence], attentionMetadata(subject.id, "primary", "achievement", 100, rate === null ? undefined : rate - 100));
    builder.source("stores.totalSales", "sales", `${subject.label}销售额`, store.totalSales, "currency", [subject.id], [performance], attentionMetadata(subject.id, "support", "achievement", target ?? undefined, sales === null || target === null ? undefined : sales - target));
    builder.source("stores.totalTarget", "target", `${subject.label}销售目标`, store.totalTarget, "currency", [subject.id], [performance], attentionMetadata(subject.id, "support", "achievement"));
    builder.source("stores.gap", "sales_gap", `${subject.label}销售目标差额`, store.gap, "currency", [subject.id], [performance, gapEvidence], attentionMetadata(subject.id, "support", "achievement", 0, gap ?? undefined));

    const daily = records(store.dailyAchievement).flatMap((day) => {
      const date = textValue(day.date);
      return date ? [{ day, date }] : [];
    });
    const dailyPerformance = builder.evidence(
      `stores.${subject.id}.dailyAchievement.performance`,
      "period_variance",
      `${subject.label}每日目标表现`,
      "currency",
      "当日销售目标",
      daily.map(({ day, date }) => series(date, day.actualSales, day.salesTarget))
    );
    const dailyGapEvidence = builder.evidence(
      `stores.${subject.id}.dailyAchievement.gap`,
      "metric_drivers",
      `${subject.label}每日销售目标差额`,
      "currency",
      "销售目标差额",
      daily.map(({ day, date }) => series(`${date}目标差额`, day.gap))
    );
    const dailyRateEvidence = builder.evidence(
      `stores.${subject.id}.dailyAchievement.rate`,
      "period_variance",
      `${subject.label}每日目标达成率`,
      "percentage",
      "目标达成率",
      daily.map(({ day, date }) => series(date, day.achievementRate))
    );
    for (const { day, date } of daily) {
      const dailySales = numberValue(day.actualSales);
      const dailyTarget = numberValue(day.salesTarget);
      const dailyGap = numberValue(day.gap);
      const dailyRate = numberValue(day.achievementRate);
      builder.source("stores.dailyAchievement.actualSales", "daily_sales", `${subject.label}${date}销售额`, day.actualSales, "currency", [subject.id, date], [dailyPerformance], attentionMetadata(subject.id, "support", "achievement", dailyTarget ?? undefined, dailySales === null || dailyTarget === null ? undefined : dailySales - dailyTarget));
      builder.source("stores.dailyAchievement.salesTarget", "daily_target", `${subject.label}${date}销售目标`, day.salesTarget, "currency", [subject.id, date], [dailyPerformance], attentionMetadata(subject.id, "support", "achievement"));
      builder.source("stores.dailyAchievement.gap", "daily_sales_gap", `${subject.label}${date}销售目标差额`, day.gap, "currency", [subject.id, date], [dailyGapEvidence], attentionMetadata(subject.id, "support", "achievement", 0, dailyGap ?? undefined));
      builder.source("stores.dailyAchievement.achievementRate", "daily_achievement_rate", `${subject.label}${date}目标达成率`, day.achievementRate, "percentage", [subject.id, date], [dailyRateEvidence], attentionMetadata(subject.id, "primary", "achievement", 100, dailyRate === null ? undefined : dailyRate - 100));
    }
  }
}

function buildReport(builder: CatalogBuilder, data: UnknownRecord): void {
  const summary = record(data.summary);
  if (Object.keys(summary).length === 0) {
    const availability = builder.evidence(
      "recordCount",
      "metric_drivers",
      "可用数据记录数",
      "count",
      "可用数据记录数",
      [series("可用数据记录数", data.recordCount)]
    );
    builder.source("recordCount", "data_availability", "可用数据记录数", data.recordCount, "count", [], [availability], attentionMetadata("scope", "primary", "data_availability"));
    return;
  }
  const totalSales = numberValue(summary.totalSales);
  const totalTarget = numberValue(summary.totalTarget);
  const achievementRate = numberValue(summary.achievementRate);
  const refundRate = numberValue(summary.refundRate);
  const summaryPerformance = builder.evidence("summary.performance", "period_variance", "整体目标表现", "currency", "销售目标", [series("销售额", summary.totalSales, summary.totalTarget)]);
  const summaryRates = builder.evidence("summary.rates", "metric_drivers", "整体经营比率", "percentage", "整体比率", [series("目标达成率", summary.achievementRate), series("退款率", summary.refundRate)]);
  const summaryAvailability = builder.evidence("summary.storeCount", "metric_drivers", "门店数量", "count", "门店数量", [series("门店数量", summary.storeCount)]);
  const summaryOrders = builder.evidence("summary.totalOrders", "metric_drivers", "整体订单量", "count", "订单量", [series("整体订单量", summary.totalOrders)]);
  const summaryAov = builder.evidence("summary.avgAOV", "metric_drivers", "整体平均客单价", "currency", "客单价", [series("整体平均客单价", summary.avgAOV)]);
  const summaryCancellation = builder.evidence("summary.totalCancelled", "metric_drivers", "整体取消订单数", "count", "取消订单数", [series("整体取消订单数", summary.totalCancelled)]);
  const summaryPromo = builder.evidence("summary.totalPromo", "metric_drivers", "整体促销销售额", "currency", "促销销售额", [series("整体促销销售额", summary.totalPromo)]);
  const summaryPromoRate = builder.evidence("summary.promoRate", "metric_drivers", "整体促销贡献率", "percentage", "促销贡献率", [series("整体促销贡献率", summary.promoRate)]);
  builder.source("summary.storeCount", "store_count", "门店数量", summary.storeCount, "count", [], [summaryAvailability], attentionMetadata("scope", "support", "data_availability"));
  builder.source("summary.totalSales", "sales", "整体销售额", summary.totalSales, "currency", [], [summaryPerformance], attentionMetadata("scope", "support", "achievement", totalTarget ?? undefined, totalSales === null || totalTarget === null ? undefined : totalSales - totalTarget));
  builder.source("summary.totalTarget", "target", "整体销售目标", summary.totalTarget, "currency", [], [summaryPerformance], attentionMetadata("scope", "support", "achievement"));
  builder.source("summary.achievementRate", "achievement_rate", "整体目标达成率", summary.achievementRate, "percentage", [], [summaryRates], attentionMetadata("scope", "primary", "achievement", 100, achievementRate === null ? undefined : achievementRate - 100));
  builder.source("summary.totalRefund", "refund", "整体退款额", summary.totalRefund, "currency", [], [summaryRates], attentionMetadata("scope", "support", "risk_rate"));
  builder.source("summary.refundRate", "refund_rate", "整体退款率", summary.refundRate, "percentage", [], [summaryRates], attentionMetadata("scope", "primary", "risk_rate", 2, refundRate === null ? undefined : refundRate - 2));
  builder.source("summary.totalOrders", "total_orders", "整体订单量", summary.totalOrders, "count", [], [summaryOrders], attentionMetadata("scope", "support", "neutral"));
  builder.source("summary.avgAOV", "avg_aov", "整体平均客单价", summary.avgAOV, "currency", [], [summaryAov], attentionMetadata("scope", "support", "neutral"));
  builder.source("summary.totalCancelled", "cancelled_orders", "整体取消订单数", summary.totalCancelled, "count", [], [summaryCancellation], attentionMetadata("scope", "support", "neutral"));
  builder.source("summary.totalPromo", "promo_sales", "整体促销销售额", summary.totalPromo, "currency", [], [summaryPromo], attentionMetadata("scope", "support", "neutral"));
  builder.source("summary.promoRate", "promo_rate", "整体促销贡献率", summary.promoRate, "percentage", [], [summaryPromoRate], attentionMetadata("scope", "support", "neutral"));

  const stores = records(data.storeRanking).flatMap((store) => {
    const subject = subjectOf(store, "storeId", "storeName");
    return subject ? [{ store, subject }] : [];
  });
  const storePerformance = builder.evidence("storeRanking.performance", "store_target_variance", "门店目标表现", "currency", "销售目标", stores.map(({ store, subject }) => series(subject.label, store.totalSales, store.totalTarget)));
  const storeRates = builder.evidence("storeRanking.achievementRate", "store_target_variance", "门店目标达成率", "percentage", "目标达成率", stores.map(({ store, subject }) => series(subject.label, store.achievementRate)));
  const storeRanks = builder.evidence("storeRanking.salesRank", "store_target_variance", "门店销售排名", "count", "销售排名", stores.map(({ store, subject }) => series(subject.label, store.salesRank)));
  for (const { store, subject } of stores) {
    const sales = numberValue(store.totalSales);
    const target = numberValue(store.totalTarget);
    const rate = numberValue(store.achievementRate);
    builder.source("storeRanking.totalSales", "sales", `${subject.label}销售额`, store.totalSales, "currency", [subject.id], [storePerformance], attentionMetadata(subject.id, "support", "achievement", target ?? undefined, sales === null || target === null ? undefined : sales - target));
    builder.source("storeRanking.totalTarget", "target", `${subject.label}销售目标`, store.totalTarget, "currency", [subject.id], [storePerformance], attentionMetadata(subject.id, "support", "achievement"));
    builder.source("storeRanking.achievementRate", "achievement_rate", `${subject.label}目标达成率`, store.achievementRate, "percentage", [subject.id], [storeRates], attentionMetadata(subject.id, "primary", "achievement", 100, rate === null ? undefined : rate - 100));
    builder.source("storeRanking.salesRank", "store_sales_rank", `${subject.label}销售排名`, store.salesRank, "count", [subject.id], [storeRanks], attentionMetadata(subject.id, "support", "neutral"));
  }

  const daily = records(data.dailyTrend).flatMap((day) => {
    const date = textValue(day.date);
    return date ? [{ day, date }] : [];
  });
  const anomalyEvidence = builder.evidence("dailyTrend.anomalies", "anomaly_dates", "异常日期", "currency", "当日销售目标", daily.filter(({ day }) => (numberValue(day.isAnomaly) || 0) > 0).map(({ day, date }) => series(date, day.sales, day.target)));
  const dailyPerformance = builder.evidence("dailyTrend.performance", "period_variance", "每日目标表现", "currency", "当日销售目标", daily.map(({ day, date }) => series(date, day.sales, day.target)));
  const dailyOrders = builder.evidence("dailyTrend.orders", "metric_drivers", "每日订单量", "count", "订单量", daily.map(({ day, date }) => series(date, day.orders)));
  const dailyAov = builder.evidence("dailyTrend.avgAOV", "metric_drivers", "每日客单价", "currency", "客单价", daily.map(({ day, date }) => series(date, day.avgAOV)));
  const dailyRank = builder.evidence("dailyTrend.ranks", "metric_drivers", "每日销售排名", "count", "销售排名", daily.flatMap(({ day, date }) => [series(`${date}销售高位排名`, day.salesRankDesc), series(`${date}销售低位排名`, day.salesRankAsc)]));
  const dailyAnomalyFlag = builder.evidence("dailyTrend.isAnomaly", "anomaly_dates", "每日异常标记", "count", "异常标记", daily.map(({ day, date }) => series(date, day.isAnomaly)));
  const dailyWeekendAverages = builder.evidence("dailyTrend.weekendAverages", "metric_drivers", "周末工作日均值", "currency", "销售均值", daily.flatMap(({ day, date }) => [series(`${date}周末均值`, day.weekendAvg), series(`${date}工作日均值`, day.weekdayAvg)]));
  const dailyWeekendVariance = builder.evidence("dailyTrend.weekendVs", "metric_drivers", "周末工作日差异", "percentage", "周末工作日差异", daily.map(({ day, date }) => series(date, day.weekendVs)));
  for (const { day, date } of daily) {
    const sales = numberValue(day.sales);
    const target = numberValue(day.target);
    const isAnomaly = (numberValue(day.isAnomaly) || 0) > 0;
    const evidence = isAnomaly ? [anomalyEvidence, dailyPerformance] : [dailyPerformance];
    builder.source("dailyTrend.sales", isAnomaly ? "daily_anomaly" : "daily_sales", `${date}销售额`, day.sales, "currency", [date], evidence, attentionMetadata(date, "support", isAnomaly ? "anomaly" : "neutral", target ?? undefined, sales === null || target === null ? undefined : sales - target));
    builder.source("dailyTrend.target", "daily_target", `${date}销售目标`, day.target, "currency", [date], [dailyPerformance], attentionMetadata(date, "support", "neutral"));
    builder.source("dailyTrend.orders", "daily_orders", `${date}订单量`, day.orders, "count", [date], [dailyOrders], attentionMetadata(date, "support", "neutral"));
    builder.source("dailyTrend.avgAOV", "daily_avg_aov", `${date}客单价`, day.avgAOV, "currency", [date], [dailyAov], attentionMetadata(date, "support", "neutral"));
    builder.source("dailyTrend.salesRankDesc", "daily_sales_rank_desc", `${date}销售高位排名`, day.salesRankDesc, "count", [date], [dailyRank], attentionMetadata(date, "support", "neutral"));
    builder.source("dailyTrend.salesRankAsc", "daily_sales_rank_asc", `${date}销售低位排名`, day.salesRankAsc, "count", [date], [dailyRank], attentionMetadata(date, "support", "neutral"));
    builder.source("dailyTrend.isAnomaly", "daily_anomaly_flag", `${date}异常标记`, day.isAnomaly, "count", [date], [dailyAnomalyFlag], attentionMetadata(date, "support", "anomaly"));
    builder.source("dailyTrend.weekendAvg", "daily_weekend_avg", `${date}周末销售均值`, day.weekendAvg, "currency", [date], [dailyWeekendAverages], attentionMetadata(date, "support", "neutral"));
    builder.source("dailyTrend.weekdayAvg", "daily_weekday_avg", `${date}工作日销售均值`, day.weekdayAvg, "currency", [date], [dailyWeekendAverages], attentionMetadata(date, "support", "neutral"));
    builder.source("dailyTrend.weekendVs", "daily_weekend_vs", `${date}周末工作日销售差异`, day.weekendVs, "percentage", [date], [dailyWeekendVariance], attentionMetadata(date, "support", "neutral"));
  }
  addReportStructureSources(builder, data.channelBreakdown, "channel");
  addReportStructureSources(builder, data.categoryBreakdown, "category");
  addReportStructureSources(builder, data.daypartBreakdown, "daypart");
}

function addReportStructureSources(builder: CatalogBuilder, value: unknown, dimension: "channel" | "category" | "daypart"): void {
  const labelPrefix = dimension === "channel" ? "渠道" : dimension === "category" ? "品类" : "时段";
  const entries = records(value).flatMap((item) => {
    const name = textValue(item.dimensionName);
    return name ? [{ item, name }] : [];
  });
  const evidence = builder.evidence(`${dimension}Breakdown`, `${dimension}_contribution` as InsightEvidenceType, `${labelPrefix}销售结构`, "currency", "销售额", entries.map(({ item, name }) => series(name, item.value)));
  const percentages = builder.evidence(`${dimension}Breakdown.pct`, `${dimension}_contribution` as InsightEvidenceType, `${labelPrefix}销售占比`, "percentage", "销售占比", entries.map(({ item, name }) => series(name, item.pct)));
  for (const { item, name } of entries) {
    builder.source(`${dimension}Breakdown.value`, `${dimension}_structure`, `${name}销售额`, item.value, "currency", [name], [evidence], attentionMetadata(name, "support", "structure"));
    builder.source(`${dimension}Breakdown.pct`, `${dimension}_structure_pct`, `${name}销售占比`, item.pct, "percentage", [name], [percentages], attentionMetadata(name, "primary", "structure"));
  }
}

function collectGenericNumericFacts(data: UnknownRecord): GenericNumericFact[] {
  const facts: GenericNumericFact[] = [];
  const visit = (
    value: unknown,
    path: string[],
    subject: { id: string; label: string } | null,
    depth: number
  ): void => {
    if (facts.length >= 5 || depth > 6) return;
    if (isFiniteNumber(value)) {
      const key = path.at(-1);
      if (key && !genericMetadataKeys.has(key)) {
        facts.push({ path: path.join("."), key, value, subject });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)], subject, depth + 1));
      return;
    }
    if (!value || typeof value !== "object") return;

    const recordValue = value as UnknownRecord;
    const ownSubject = subjectOf(recordValue, "storeId", "storeName") || subject;
    for (const [key, item] of Object.entries(recordValue)) {
      if (genericMetadataKeys.has(key)) continue;
      visit(item, [...path, key], ownSubject, depth + 1);
      if (facts.length >= 5) return;
    }
  };

  visit(data, [], null, 0);
  return facts;
}

function inferGenericUnit(key: string): Unit {
  const normalized = key.toLowerCase();
  if (/(rate|pct|percentage)/.test(normalized)) return "percentage";
  if (/(sales|target|gap|amount|aov|refund|discount|revenue)/.test(normalized)) {
    return "currency";
  }
  return "count";
}

function humanizeMetricKey(key: string): string {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
}

function buildOrderTrend(builder: CatalogBuilder, data: UnknownRecord): void {
  for (const store of records(data.stores)) {
    const subject = subjectOf(store, "storeId", "storeName");
    if (!subject) continue;
    const period = builder.evidence(`stores.${subject.id}.orders`, "period_variance", `${subject.label}订单目标差异`, "count", "订单目标", [series(subject.label, store.totalOrders, store.totalOrderTarget)]);
    const drivers = builder.evidence(`stores.${subject.id}.trend`, "metric_drivers", `${subject.label}订单表现`, "percentage", "订单比率", [series("订单达成率", store.orderAchievementRate), series("趋势变化", store.trendPct)]);
    builder.source("stores.totalOrders", "total_orders", `${subject.label}订单量`, store.totalOrders, "count", [subject.id], [period], attentionMetadata(subject.id, "support", "neutral", numberValue(store.totalOrderTarget) ?? undefined, numberValue(store.totalOrders) === null || numberValue(store.totalOrderTarget) === null ? undefined : numberValue(store.totalOrders)! - numberValue(store.totalOrderTarget)!));
    builder.source("stores.orderAchievementRate", "order_achievement_rate", `${subject.label}订单达成率`, store.orderAchievementRate, "percentage", [subject.id], [drivers], attentionMetadata(subject.id, "primary", "achievement", 100, numberValue(store.orderAchievementRate) === null ? undefined : numberValue(store.orderAchievementRate)! - 100));
    builder.source("stores.trendPct", "trend_pct", `${subject.label}订单趋势`, store.trendPct, "percentage", [subject.id], [drivers], attentionMetadata(subject.id, "primary", "trend", 0, numberValue(store.trendPct) ?? undefined));
  }
}

function buildAovTrend(builder: CatalogBuilder, data: UnknownRecord): void {
  for (const store of records(data.stores)) {
    const subject = subjectOf(store, "storeId", "storeName");
    if (!subject) continue;
    const period = builder.evidence(`stores.${subject.id}.aov`, "period_variance", `${subject.label}客单价目标差异`, "currency", "目标客单价", [series(subject.label, store.avgAOV, store.targetAOV)]);
    const drivers = builder.evidence(`stores.${subject.id}.aov-drivers`, "metric_drivers", `${subject.label}客单价差额`, "currency", "客单价差额", [series("客单价差额", store.aovGap)]);
    const trend = builder.evidence(`stores.${subject.id}.aov-trend`, "metric_drivers", `${subject.label}客单价趋势`, "percentage", "趋势变化", [series("趋势变化", store.trendPct)]);
    builder.source("stores.avgAOV", "avg_aov", `${subject.label}平均客单价`, store.avgAOV, "currency", [subject.id], [period], attentionMetadata(subject.id, "support", "achievement", numberValue(store.targetAOV) ?? undefined, numberValue(store.avgAOV) === null || numberValue(store.targetAOV) === null ? undefined : numberValue(store.avgAOV)! - numberValue(store.targetAOV)!));
    builder.source("stores.targetAOV", "target_aov", `${subject.label}目标客单价`, store.targetAOV, "currency", [subject.id], [period], attentionMetadata(subject.id, "support", "achievement"));
    builder.source("stores.aovGap", "aov_gap", `${subject.label}客单价差额`, store.aovGap, "currency", [subject.id], [drivers], attentionMetadata(subject.id, "primary", "achievement", 0, numberValue(store.aovGap) ?? undefined));
    builder.source("stores.trendPct", "trend_pct", `${subject.label}客单价趋势`, store.trendPct, "percentage", [subject.id], [trend], attentionMetadata(subject.id, "primary", "trend", 0, numberValue(store.trendPct) ?? undefined));
  }
}

function buildMix(builder: CatalogBuilder, data: UnknownRecord, dimension: "channel" | "daypart"): void {
  const nameKey = dimension;
  const overallKey = dimension === "channel" ? "channelPct" : "daypartPct";
  const storeKey = dimension === "channel" ? "channels" : "dayparts";
  const type = dimension === "channel" ? "channel_contribution" : "daypart_contribution";
  const unitLabel = dimension === "channel" ? "渠道" : "时段";
  const overall = records(data[overallKey]).flatMap((item) => {
    const name = textValue(item[nameKey]);
    return name ? [{ item, name }] : [];
  });
  const stores = records(data.byStore).flatMap((store) => {
    const subject = subjectOf(store, "storeId", "storeName");
    return subject ? [{ store, subject }] : [];
  });
  const shareEvidence = builder.evidence(overallKey, type, `${unitLabel}销售占比`, "percentage", "销售占比", overall.map(({ item, name }) => series(name, item.salesPct)));
  const valueEvidence = builder.evidence(`byStore.${storeKey}`, type, `${unitLabel}门店销售贡献`, "currency", "销售额", stores.flatMap((store) => {
      return records(store.store[storeKey]).map((item) => {
        const name = textValue(item[nameKey]);
        return name ? series(`${store.subject.label}-${name}`, item.sales) : null;
      });
    }));
  for (const { item, name } of overall) {
    builder.source(`${overallKey}.salesPct`, `${dimension}_pct`, `${name}销售占比`, item.salesPct, "percentage", [name], [shareEvidence], attentionMetadata(name, "primary", "structure"));
  }
  for (const { store, subject } of stores) {
    for (const item of records(store[storeKey])) {
      const name = textValue(item[nameKey]);
      if (!name) continue;
      builder.source(`byStore.${storeKey}.sales`, `${dimension}_value`, `${subject.label}${name}销售额`, item.sales, "currency", [subject.id, name], [valueEvidence], attentionMetadata(subject.id, "support", "structure"));
    }
  }
}

function buildPromotion(builder: CatalogBuilder, data: UnknownRecord): void {
  const details = records(data.promotionDetails).flatMap((item) => {
    const name = textValue(item.promotionName);
    return name ? [{ item, name }] : [];
  });
  const rateDriver = builder.evidence("contributionRate", "metric_drivers", "促销贡献率", "percentage", "促销贡献率", [series("促销贡献率", data.contributionRate)]);
  const discountDriver = builder.evidence("promotionDetails", "metric_drivers", "促销优惠驱动", "currency", "优惠金额", [series("总优惠", data.totalDiscount), ...details.map(({ item, name }) => series(name, item.discountAmount))]);
  const stores = records(data.byStore).flatMap((store) => {
    const subject = subjectOf(store, "storeId", "storeName");
    return subject ? [{ store, subject }] : [];
  });
  const rateVariance = builder.evidence("byStore.contributionRate", "store_target_variance", "门店促销贡献差异", "percentage", "促销贡献率", stores.map(({ store, subject }) => series(subject.label, store.contributionRate)));
  const discountVariance = builder.evidence("byStore.totalDiscount", "store_target_variance", "门店优惠金额差异", "currency", "优惠金额", stores.map(({ store, subject }) => series(subject.label, store.totalDiscount)));
  builder.source("contributionRate", "contribution_rate", "促销贡献率", data.contributionRate, "percentage", [], [rateDriver], attentionMetadata("scope", "primary", "structure"));
  builder.source("totalDiscount", "total_discount", "促销优惠总额", data.totalDiscount, "currency", [], [discountDriver], attentionMetadata("scope", "support", "structure"));
  for (const { item, name } of details) {
    builder.source("promotionDetails.discountAmount", "promotion_value", `${name}优惠金额`, item.discountAmount, "currency", [name], [discountDriver], attentionMetadata(name, "support", "structure"));
  }
  for (const { store, subject } of stores) {
    builder.source("byStore.contributionRate", "store_contribution_rate", `${subject.label}促销贡献率`, store.contributionRate, "percentage", [subject.id], [rateVariance], attentionMetadata(subject.id, "primary", "structure"));
    builder.source("byStore.totalDiscount", "total_discount", `${subject.label}优惠金额`, store.totalDiscount, "currency", [subject.id], [discountVariance], attentionMetadata(subject.id, "support", "structure"));
  }
}

function buildRefund(builder: CatalogBuilder, data: UnknownRecord): void {
  const stores = records(data.byStore).flatMap((store) => {
    const subject = subjectOf(store, "storeId", "storeName");
    return subject ? [{ store, subject }] : [];
  });
  const drivers = builder.evidence("refund-summary", "metric_drivers", "退款取消驱动", "percentage", "整体比率", [series("退款率", data.refundRate), series("取消率", data.cancelRate), ...stores.flatMap(({ store, subject }) => {
    return [series(`${subject.label}退款率`, store.refundRate), series(`${subject.label}取消率`, store.cancelRate)];
  })]);
  const daily = records(data.dailyRefund).flatMap((item) => {
    const date = textValue(item.date);
    return date ? [{ item, date }] : [];
  });
  const dates = builder.evidence("dailyRefund", "anomaly_dates", "退款异常日期", "percentage", "每日退款率", daily.map(({ item, date }) => series(date, item.refundRate)));
  builder.source("refundRate", "refund_rate", "整体退款率", data.refundRate, "percentage", [], [drivers], attentionMetadata("scope", "primary", "risk_rate", 2, numberValue(data.refundRate) === null ? undefined : numberValue(data.refundRate)! - 2));
  builder.source("cancelRate", "cancel_rate", "整体取消率", data.cancelRate, "percentage", [], [drivers], attentionMetadata("scope", "primary", "risk_rate", 0, numberValue(data.cancelRate) ?? undefined));
  for (const { item, date } of daily) builder.source("dailyRefund.refundRate", "daily_refund_rate", `${date}退款率`, item.refundRate, "percentage", [date], [dates], attentionMetadata(date, "primary", "risk_rate", 2, numberValue(item.refundRate) === null ? undefined : numberValue(item.refundRate)! - 2));
  for (const { store, subject } of stores) {
    builder.source("byStore.refundRate", "store_refund_rate", `${subject.label}退款率`, store.refundRate, "percentage", [subject.id], [drivers], attentionMetadata(subject.id, "primary", "risk_rate", 2, numberValue(store.refundRate) === null ? undefined : numberValue(store.refundRate)! - 2));
    builder.source("byStore.cancelRate", "cancel_rate", `${subject.label}取消率`, store.cancelRate, "percentage", [subject.id], [drivers], attentionMetadata(subject.id, "primary", "risk_rate", 0, numberValue(store.cancelRate) ?? undefined));
  }
}

function buildAnomaly(builder: CatalogBuilder, data: UnknownRecord): void {
  for (const store of records(data.stores)) {
    const subject = subjectOf(store, "storeId", "storeName");
    if (!subject) continue;
    const days = records(store.anomalyDays).flatMap((day) => {
      const date = textValue(day.date);
      return date ? [{ day, date }] : [];
    });
    const dates = builder.evidence(`stores.${subject.id}.anomalyDays`, "anomaly_dates", `${subject.label}异常日期`, "currency", "当日销售目标", days.map(({ day, date }) => series(date, day.actualSales, day.salesTarget)));
    const drivers = builder.evidence(`stores.${subject.id}.anomalyDrivers`, "metric_drivers", `${subject.label}异常驱动`, "ratio", "标准分", days.map(({ day, date }) => series(date, day.zScore)));
    const count = builder.evidence(`stores.${subject.id}.anomalyCount`, "metric_drivers", `${subject.label}异常日数量`, "count", "异常日数量", [series("异常日数量", store.anomalyCount)]);
    builder.source("stores.anomalyCount", "anomaly_count", `${subject.label}异常日数量`, store.anomalyCount, "count", [subject.id], [count, drivers], attentionMetadata(subject.id, "primary", "anomaly", 0, numberValue(store.anomalyCount) ?? undefined));
    for (const { day, date } of days) builder.source("stores.anomalyDays.actualSales", "anomaly_day", `${subject.label}${date}销售额`, day.actualSales, "currency", [subject.id, date], [dates], attentionMetadata(subject.id, "support", "anomaly", numberValue(day.salesTarget) ?? undefined, numberValue(day.actualSales) === null || numberValue(day.salesTarget) === null ? undefined : numberValue(day.actualSales)! - numberValue(day.salesTarget)!));
  }
}

function buildCompare(builder: CatalogBuilder, data: UnknownRecord): void {
  const stores = records(data.stores).flatMap((store) => {
    const subject = subjectOf(store, "storeId", "storeName");
    return subject ? [{ store, subject }] : [];
  });
  const salesVariance = builder.evidence("store-performance", "store_target_variance", "门店目标表现", "currency", "销售目标", stores.map((store) => {
    return series(store.subject.label, store.store.totalSales, store.store.totalTarget);
  }));
  const rateVariance = builder.evidence("store-achievement-rate", "store_target_variance", "门店目标达成率", "percentage", "目标达成率", stores.map(({ store, subject }) => series(subject.label, store.achievementRate)));
  const orderVariance = builder.evidence("store-orders", "store_target_variance", "门店订单差异", "count", "订单量", stores.map(({ store, subject }) => series(subject.label, store.totalOrders)));
  const aovVariance = builder.evidence("store-aov", "store_target_variance", "门店客单价差异", "currency", "客单价", stores.map(({ store, subject }) => series(subject.label, store.avgOrderValue)));
  const refundVariance = builder.evidence("store-refund", "store_target_variance", "门店退款差异", "currency", "退款额", stores.map(({ store, subject }) => series(subject.label, store.totalRefund)));
  const refundRateVariance = builder.evidence("store-refund-rate", "store_target_variance", "门店退款率差异", "percentage", "退款率", stores.map(({ store, subject }) => series(subject.label, store.refundRate)));
  const channel = contributionEvidence(builder, stores, "channelBreakdown", "channel_contribution", "渠道贡献");
  const category = contributionEvidence(builder, stores, "categoryBreakdown", "category_contribution", "品类贡献");
  const daypart = contributionEvidence(builder, stores, "daypartBreakdown", "daypart_contribution", "时段贡献");
  for (const { store, subject } of stores) {
    builder.source("stores.totalSales", "sales", `${subject.label}销售额`, store.totalSales, "currency", [subject.id], [salesVariance], attentionMetadata(subject.id, "support", "achievement", numberValue(store.totalTarget) ?? undefined, numberValue(store.totalSales) === null || numberValue(store.totalTarget) === null ? undefined : numberValue(store.totalSales)! - numberValue(store.totalTarget)!));
    builder.source("stores.totalTarget", "target", `${subject.label}销售目标`, store.totalTarget, "currency", [subject.id], [salesVariance], attentionMetadata(subject.id, "support", "achievement"));
    builder.source("stores.achievementRate", "achievement_rate", `${subject.label}目标达成率`, store.achievementRate, "percentage", [subject.id], [rateVariance], attentionMetadata(subject.id, "primary", "achievement", 100, numberValue(store.achievementRate) === null ? undefined : numberValue(store.achievementRate)! - 100));
    builder.source("stores.totalOrders", "orders", `${subject.label}订单量`, store.totalOrders, "count", [subject.id], [orderVariance], attentionMetadata(subject.id, "support", "neutral"));
    builder.source("stores.avgOrderValue", "aov", `${subject.label}客单价`, store.avgOrderValue, "currency", [subject.id], [aovVariance], attentionMetadata(subject.id, "support", "neutral"));
    builder.source("stores.totalRefund", "refund", `${subject.label}退款额`, store.totalRefund, "currency", [subject.id], [refundVariance], attentionMetadata(subject.id, "support", "risk_rate"));
    builder.source("stores.refundRate", "refund_rate", `${subject.label}退款率`, store.refundRate, "percentage", [subject.id], [refundRateVariance], attentionMetadata(subject.id, "primary", "risk_rate", 2, numberValue(store.refundRate) === null ? undefined : numberValue(store.refundRate)! - 2));
    addBreakdownSources(builder, store, subject, "channelBreakdown", "channel_contribution", channel);
    addBreakdownSources(builder, store, subject, "categoryBreakdown", "category_contribution", category);
    addBreakdownSources(builder, store, subject, "daypartBreakdown", "daypart_contribution", daypart);
  }
}

function buildAttribution(builder: CatalogBuilder, data: UnknownRecord): void {
  const summary = record(data.salesSummary);
  const period = builder.evidence("salesSummary", "period_variance", "销售目标差异", "currency", "销售目标", [series("销售额", summary.totalSales, summary.totalTarget)]);
  const ratePeriod = builder.evidence("salesSummary.achievementRate", "period_variance", "目标达成率", "percentage", "目标达成率", [series("目标达成率", summary.achievementRate)]);
  const orderPeriod = builder.evidence("salesSummary.totalOrders", "period_variance", "订单量", "count", "订单量", [series("订单量", summary.totalOrders)]);
  const aovPeriod = builder.evidence("salesSummary.avgOrderValue", "period_variance", "客单价", "currency", "客单价", [series("客单价", summary.avgOrderValue)]);
  builder.source("salesSummary.totalSales", "sales_summary", "销售额", summary.totalSales, "currency", [], [period], attentionMetadata("scope", "support", "achievement", numberValue(summary.totalTarget) ?? undefined, numberValue(summary.totalSales) === null || numberValue(summary.totalTarget) === null ? undefined : numberValue(summary.totalSales)! - numberValue(summary.totalTarget)!));
  builder.source("salesSummary.totalTarget", "sales_summary", "销售目标", summary.totalTarget, "currency", [], [period], attentionMetadata("scope", "support", "achievement"));
  builder.source("salesSummary.achievementRate", "sales_summary", "目标达成率", summary.achievementRate, "percentage", [], [ratePeriod], attentionMetadata("scope", "primary", "achievement", 100, numberValue(summary.achievementRate) === null ? undefined : numberValue(summary.achievementRate)! - 100));
  builder.source("salesSummary.totalOrders", "sales_summary", "订单量", summary.totalOrders, "count", [], [orderPeriod], attentionMetadata("scope", "support", "neutral"));
  builder.source("salesSummary.avgOrderValue", "sales_summary", "客单价", summary.avgOrderValue, "currency", [], [aovPeriod], attentionMetadata("scope", "support", "neutral"));

  const decomposition = record(data.decomposition);
  const factors = records(data.factorContributions).flatMap((factor) => {
    const id = textValue(factor.factor);
    const label = textValue(factor.label);
    return id && label ? [{ factor, id, label }] : [];
  });
  const drivers = builder.evidence("decomposition", "metric_drivers", "归因驱动", "currency", "差异贡献", [series("总差异", decomposition.totalGap), series("订单量差异", decomposition.orderVolumeGap), series("客单价差异", decomposition.aovGap), series("交互项", decomposition.interaction), ...factors.map(({ factor, label }) => series(label, factor.contribution))]);
  for (const [path, label] of [["totalGap", "总差异"], ["orderVolumeGap", "订单量差异"], ["aovGap", "客单价差异"], ["interaction", "交互项"]] as const) {
    builder.source(`decomposition.${path}`, "decomposition", label, decomposition[path], "currency", [], [drivers], attentionMetadata("scope", "primary", "contribution", 0, numberValue(decomposition[path]) ?? undefined));
  }
  for (const { factor, id, label } of factors) {
    builder.source("factorContributions.contribution", "factor_contribution", label, factor.contribution, "currency", [id], [drivers], attentionMetadata(id, "primary", "contribution", 0, numberValue(factor.contribution) ?? undefined));
  }
  const dimensions = records(decomposition.dimensionContributions);
  for (const [dimension, type, title] of [["channel", "channel_contribution", "渠道贡献"], ["category", "category_contribution", "品类贡献"], ["daypart", "daypart_contribution", "时段贡献"]] as const) {
    const items = dimensions.flatMap((item) => {
      const name = textValue(item.name);
      return item.dimension === dimension && name ? [{ item, name }] : [];
    });
    const evidence = builder.evidence(`decomposition.${dimension}`, type, `${title}差异`, "currency", "差异贡献", items.map(({ item, name }) => series(name, item.contribution)));
    for (const { item, name } of items) builder.source("decomposition.dimensionContributions.contribution", "dimension_contribution", `${name}差异贡献`, item.contribution, "currency", [dimension, name], [evidence], attentionMetadata(dimension, "primary", "contribution", 0, numberValue(item.contribution) ?? undefined));
  }
  addAttributionBreakdown(builder, data.channelBreakdown, "channel", "channel_contribution", "渠道贡献");
  addAttributionBreakdown(builder, data.categoryBreakdown, "category", "category_contribution", "品类贡献");
  addAttributionBreakdown(builder, data.daypartBreakdown, "daypart", "daypart_contribution", "时段贡献");
  const refunds = records(data.refundByStore);
  if (refunds.length > 0) {
    const validRefunds = refunds.flatMap((item) => {
      const subject = subjectOf(item, "storeId", "storeName");
      return subject ? [{ item, subject }] : [];
    });
    const variance = builder.evidence("refundByStore", "store_target_variance", "门店退款差异", "currency", "退款额", validRefunds.map(({ item, subject }) => series(subject.label, item.refundAmount)));
    for (const { item, subject } of validRefunds) {
      builder.source("refundByStore.refundAmount", "store_refund", `${subject.label}退款额`, item.refundAmount, "currency", [subject.id], [variance], attentionMetadata(subject.id, "support", "risk_rate"));
    }
  }
}

function addAttributionBreakdown(
  builder: CatalogBuilder,
  value: unknown,
  dimension: string,
  type: InsightEvidenceType,
  title: string
): void {
  const entries = Object.entries(record(value)).flatMap(([rawName, amount]) => {
    const name = textValue(rawName);
    return name ? [{ name, amount }] : [];
  });
  const evidence = builder.evidence(`${dimension}Breakdown`, type, title, "currency", "销售额", entries.map(({ name, amount }) => series(name, amount)));
  for (const { name, amount } of entries) {
    builder.source(`${dimension}Breakdown`, `${dimension}_contribution`, `${name}销售额`, amount, "currency", [name], [evidence], attentionMetadata(name, "primary", "contribution"));
  }
}

interface StoreWithSubject {
  store: UnknownRecord;
  subject: { id: string; label: string };
}

function contributionEvidence(builder: CatalogBuilder, stores: StoreWithSubject[], key: string, type: InsightEvidenceType, title: string): string | null {
  return builder.evidence(key, type, title, "currency", "销售额", stores.flatMap(({ store, subject }) => {
    return Object.entries(record(store[key])).flatMap(([rawName, value]) => {
      const name = textValue(rawName);
      return name ? [series(`${subject.label}-${name}`, value)] : [];
    });
  }));
}

function addBreakdownSources(builder: CatalogBuilder, store: UnknownRecord, subject: { id: string; label: string }, key: string, metricCode: string, evidenceId: string | null): void {
  for (const [rawName, value] of Object.entries(record(store[key]))) {
    const name = textValue(rawName);
    if (!name) continue;
    builder.source(`stores.${key}`, metricCode, `${subject.label}${name}销售额`, value, "currency", [subject.id, name], [evidenceId], attentionMetadata(subject.id, "support", "structure"));
  }
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is UnknownRecord =>
          item !== null && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function subjectOf(value: UnknownRecord, idKey: string, labelKey: string): { id: string; label: string } | null {
  const id = textValue(value[idKey]);
  const label = textValue(value[labelKey]);
  return id && label ? { id, label } : null;
}

function textValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function numberValue(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function attentionMetadata(
  subjectKey: string,
  role: InsightSourceAttentionMetadata["role"],
  signal: InsightSourceAttentionMetadata["signal"],
  benchmark?: number,
  delta?: number
): InsightSourceAttentionMetadata {
  return {
    subjectKey,
    role,
    signal,
    ...(benchmark === undefined ? {} : { benchmark }),
    ...(delta === undefined ? {} : { delta }),
  };
}

function series(label: string, value: unknown, baseline?: unknown): InsightEvidenceSeries | null {
  if (!isFiniteNumber(value) || (baseline !== undefined && !isFiniteNumber(baseline))) return null;
  return { key: stableId(label), label, value, ...(baseline === undefined ? {} : { baseline }), direction: baseline === undefined ? direction(value) : direction(value - baseline) };
}

function direction(value: number): InsightEvidenceSeries["direction"] {
  return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
}

function formatValue(value: number, unit: Unit): string {
  if (unit === "currency") return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  if (unit === "percentage") return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value)}%`;
  if (unit === "count") return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function stableId(...parts: string[]): string {
  const readable = parts
    .map((part) => part.normalize("NFKC").toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "") || "value")
    .join("-");
  const hash = createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 8);
  return `${readable}-${hash}`;
}
