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
    case "report":
    case "custom_metric":
    case "irrelevant":
      throw new InsightValidationError("INSUFFICIENT_SOURCE_DATA");
    default: {
      const exhaustive: never = input.intent;
      throw new InsightValidationError("UNSUPPORTED_INTENT", String(exhaustive));
    }
  }

  const catalog = builder.build();
  if (
    catalog.findingSources.length < 3 ||
    !catalog.evidenceCandidates.some((candidate) => candidate.series.length > 0)
  ) {
    throw new InsightValidationError("INSUFFICIENT_SOURCE_DATA");
  }
  return catalog;
}

class CatalogBuilder {
  readonly findingSources: InsightFindingSource[] = [];
  readonly evidenceCandidates: InsightEvidenceCandidate[] = [];

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
    evidenceIds: Array<string | null>
  ): void {
    if (!isFiniteNumber(value)) return;
    this.findingSources.push({
      id: stableId(this.intent, path, ...subjectIds),
      metricCode,
      label,
      value,
      unit,
      displayValue: formatValue(value, unit),
      subjectIds: [...subjectIds],
      evidenceCandidateIds: evidenceIds.filter((id): id is string => Boolean(id)),
    });
  }

  build(): InsightSourceCatalog {
    return {
      findingSources: this.findingSources,
      evidenceCandidates: this.evidenceCandidates,
      verificationMetricLabels: { ...verificationMetricLabels },
    };
  }
}

function buildOrderTrend(builder: CatalogBuilder, data: UnknownRecord): void {
  for (const store of records(data.stores)) {
    const subject = subjectOf(store, "storeId", "storeName");
    if (!subject) continue;
    const period = builder.evidence(`stores.${subject.id}.orders`, "period_variance", `${subject.label}订单目标差异`, "count", "订单目标", [series(subject.label, store.totalOrders, store.totalOrderTarget)]);
    const drivers = builder.evidence(`stores.${subject.id}.trend`, "metric_drivers", `${subject.label}订单表现`, "percentage", "订单比率", [series("订单达成率", store.orderAchievementRate), series("趋势变化", store.trendPct)]);
    builder.source("stores.totalOrders", "total_orders", `${subject.label}订单量`, store.totalOrders, "count", [subject.id], [period]);
    builder.source("stores.orderAchievementRate", "order_achievement_rate", `${subject.label}订单达成率`, store.orderAchievementRate, "percentage", [subject.id], [drivers]);
    builder.source("stores.trendPct", "trend_pct", `${subject.label}订单趋势`, store.trendPct, "percentage", [subject.id], [drivers]);
  }
}

function buildAovTrend(builder: CatalogBuilder, data: UnknownRecord): void {
  for (const store of records(data.stores)) {
    const subject = subjectOf(store, "storeId", "storeName");
    if (!subject) continue;
    const period = builder.evidence(`stores.${subject.id}.aov`, "period_variance", `${subject.label}客单价目标差异`, "currency", "目标客单价", [series(subject.label, store.avgAOV, store.targetAOV)]);
    const drivers = builder.evidence(`stores.${subject.id}.aov-drivers`, "metric_drivers", `${subject.label}客单价差额`, "currency", "客单价差额", [series("客单价差额", store.aovGap)]);
    const trend = builder.evidence(`stores.${subject.id}.aov-trend`, "metric_drivers", `${subject.label}客单价趋势`, "percentage", "趋势变化", [series("趋势变化", store.trendPct)]);
    builder.source("stores.avgAOV", "avg_aov", `${subject.label}平均客单价`, store.avgAOV, "currency", [subject.id], [period]);
    builder.source("stores.targetAOV", "target_aov", `${subject.label}目标客单价`, store.targetAOV, "currency", [subject.id], [period]);
    builder.source("stores.aovGap", "aov_gap", `${subject.label}客单价差额`, store.aovGap, "currency", [subject.id], [drivers]);
    builder.source("stores.trendPct", "trend_pct", `${subject.label}客单价趋势`, store.trendPct, "percentage", [subject.id], [trend]);
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
    builder.source(`${overallKey}.salesPct`, `${dimension}_pct`, `${name}销售占比`, item.salesPct, "percentage", [name], [shareEvidence]);
  }
  for (const { store, subject } of stores) {
    for (const item of records(store[storeKey])) {
      const name = textValue(item[nameKey]);
      if (!name) continue;
      builder.source(`byStore.${storeKey}.sales`, `${dimension}_value`, `${subject.label}${name}销售额`, item.sales, "currency", [subject.id, name], [valueEvidence]);
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
  builder.source("contributionRate", "contribution_rate", "促销贡献率", data.contributionRate, "percentage", [], [rateDriver]);
  builder.source("totalDiscount", "total_discount", "促销优惠总额", data.totalDiscount, "currency", [], [discountDriver]);
  for (const { item, name } of details) {
    builder.source("promotionDetails.discountAmount", "promotion_value", `${name}优惠金额`, item.discountAmount, "currency", [name], [discountDriver]);
  }
  for (const { store, subject } of stores) {
    builder.source("byStore.contributionRate", "store_contribution_rate", `${subject.label}促销贡献率`, store.contributionRate, "percentage", [subject.id], [rateVariance]);
    builder.source("byStore.totalDiscount", "total_discount", `${subject.label}优惠金额`, store.totalDiscount, "currency", [subject.id], [discountVariance]);
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
  builder.source("refundRate", "refund_rate", "整体退款率", data.refundRate, "percentage", [], [drivers]);
  builder.source("cancelRate", "cancel_rate", "整体取消率", data.cancelRate, "percentage", [], [drivers]);
  for (const { item, date } of daily) builder.source("dailyRefund.refundRate", "daily_refund_rate", `${date}退款率`, item.refundRate, "percentage", [date], [dates]);
  for (const { store, subject } of stores) {
    builder.source("byStore.refundRate", "store_refund_rate", `${subject.label}退款率`, store.refundRate, "percentage", [subject.id], [drivers]);
    builder.source("byStore.cancelRate", "cancel_rate", `${subject.label}取消率`, store.cancelRate, "percentage", [subject.id], [drivers]);
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
    builder.evidence(`stores.${subject.id}.anomalyDrivers`, "metric_drivers", `${subject.label}异常驱动`, "ratio", "标准分", days.map(({ day, date }) => series(date, day.zScore)));
    const count = builder.evidence(`stores.${subject.id}.anomalyCount`, "metric_drivers", `${subject.label}异常日数量`, "count", "异常日数量", [series("异常日数量", store.anomalyCount)]);
    builder.source("stores.anomalyCount", "anomaly_count", `${subject.label}异常日数量`, store.anomalyCount, "count", [subject.id], [count]);
    for (const { day, date } of days) builder.source("stores.anomalyDays.actualSales", "anomaly_day", `${subject.label}${date}销售额`, day.actualSales, "currency", [subject.id, date], [dates]);
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
    builder.source("stores.totalSales", "sales", `${subject.label}销售额`, store.totalSales, "currency", [subject.id], [salesVariance]);
    builder.source("stores.totalTarget", "target", `${subject.label}销售目标`, store.totalTarget, "currency", [subject.id], [salesVariance]);
    builder.source("stores.achievementRate", "achievement_rate", `${subject.label}目标达成率`, store.achievementRate, "percentage", [subject.id], [rateVariance]);
    builder.source("stores.totalOrders", "orders", `${subject.label}订单量`, store.totalOrders, "count", [subject.id], [orderVariance]);
    builder.source("stores.avgOrderValue", "aov", `${subject.label}客单价`, store.avgOrderValue, "currency", [subject.id], [aovVariance]);
    builder.source("stores.totalRefund", "refund", `${subject.label}退款额`, store.totalRefund, "currency", [subject.id], [refundVariance]);
    builder.source("stores.refundRate", "refund_rate", `${subject.label}退款率`, store.refundRate, "percentage", [subject.id], [refundRateVariance]);
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
  builder.source("salesSummary.totalSales", "sales_summary", "销售额", summary.totalSales, "currency", [], [period]);
  builder.source("salesSummary.totalTarget", "sales_summary", "销售目标", summary.totalTarget, "currency", [], [period]);
  builder.source("salesSummary.achievementRate", "sales_summary", "目标达成率", summary.achievementRate, "percentage", [], [ratePeriod]);
  builder.source("salesSummary.totalOrders", "sales_summary", "订单量", summary.totalOrders, "count", [], [orderPeriod]);
  builder.source("salesSummary.avgOrderValue", "sales_summary", "客单价", summary.avgOrderValue, "currency", [], [aovPeriod]);

  const decomposition = record(data.decomposition);
  const factors = records(data.factorContributions).flatMap((factor) => {
    const id = textValue(factor.factor);
    const label = textValue(factor.label);
    return id && label ? [{ factor, id, label }] : [];
  });
  const drivers = builder.evidence("decomposition", "metric_drivers", "归因驱动", "currency", "差异贡献", [series("总差异", decomposition.totalGap), series("订单量差异", decomposition.orderVolumeGap), series("客单价差异", decomposition.aovGap), series("交互项", decomposition.interaction), ...factors.map(({ factor, label }) => series(label, factor.contribution))]);
  for (const [path, label] of [["totalGap", "总差异"], ["orderVolumeGap", "订单量差异"], ["aovGap", "客单价差异"], ["interaction", "交互项"]] as const) {
    builder.source(`decomposition.${path}`, "decomposition", label, decomposition[path], "currency", [], [drivers]);
  }
  for (const { factor, id, label } of factors) {
    builder.source("factorContributions.contribution", "factor_contribution", label, factor.contribution, "currency", [id], [drivers]);
  }
  const dimensions = records(decomposition.dimensionContributions);
  for (const [dimension, type, title] of [["channel", "channel_contribution", "渠道贡献"], ["category", "category_contribution", "品类贡献"], ["daypart", "daypart_contribution", "时段贡献"]] as const) {
    const items = dimensions.flatMap((item) => {
      const name = textValue(item.name);
      return item.dimension === dimension && name ? [{ item, name }] : [];
    });
    const evidence = builder.evidence(`decomposition.${dimension}`, type, `${title}差异`, "currency", "差异贡献", items.map(({ item, name }) => series(name, item.contribution)));
    for (const { item, name } of items) builder.source("decomposition.dimensionContributions.contribution", "dimension_contribution", `${name}差异贡献`, item.contribution, "currency", [dimension, name], [evidence]);
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
      builder.source("refundByStore.refundAmount", "store_refund", `${subject.label}退款额`, item.refundAmount, "currency", [subject.id], [variance]);
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
    builder.source(`${dimension}Breakdown`, `${dimension}_contribution`, `${name}销售额`, amount, "currency", [name], [evidence]);
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
    builder.source(`stores.${key}`, metricCode, `${subject.label}${name}销售额`, value, "currency", [subject.id, name], [evidenceId]);
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
