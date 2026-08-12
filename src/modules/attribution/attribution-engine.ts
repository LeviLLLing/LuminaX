import type { Entities } from "@/modules/domain/analysis-types";
import type { SalesData } from "@/modules/domain/sales-data";
import type { AttributionData } from "@/modules/attribution/attribution-types";
import { createAnalysisSnapshot } from "@/modules/analytics/analysis-snapshot";
import {
  buildChannelDaily,
  buildDailyDetail,
  buildRefundDaily,
  calculateOrderVsAov,
  resolveAttributionScope,
} from "@/modules/attribution/factor-detectors";
import {
  buildPromotionSummary,
  buildRefundByStore,
} from "@/modules/attribution/attribution-scorer";
import { summarizeAnalysisSnapshot } from "@/modules/metrics/core-calculations";
import {
  aggregateFromTotals,
  categoryItemsFromRecords,
  dimensionTotalsFromSnapshot,
  promoFromRecords,
  readBenchmarkKind,
  refundReasonsFromRecords,
  resolveBenchmarkSelection,
  storeInfoFromMaster,
} from "@/modules/attribution/benchmark-resolver";
import { enrichAttributionV2 } from "@/modules/attribution/attribution-enrichment";
import type { FeedbackInputRow } from "@/modules/attribution/feedback-signals";

export function computeAttributionData(
  entities: Entities,
  defaultStartDate: string,
  defaultEndDate: string,
  salesData: SalesData
): AttributionData {
  const scope = resolveAttributionScope(
    salesData,
    entities,
    defaultStartDate,
    defaultEndDate
  );
  const snapshot = createAnalysisSnapshot(salesData, {
    storeIds: scope.targetStoreIds,
    startDate: scope.startDate,
    endDate: scope.endDate,
  });
  const dataSummary = summarizeAnalysisSnapshot(snapshot);
  const base: AttributionData = {
    dateRange: { start: scope.startDate, end: scope.endDate },
    storeIds: scope.targetStoreIds,
    storeNames: scope.storeNames,
    salesSummary: {
      totalSales: dataSummary.salesSummary.totalSales,
      totalTarget: dataSummary.salesSummary.totalTarget,
      achievementRate: parseFloat(dataSummary.salesSummary.achievementRate),
      totalOrders: dataSummary.salesSummary.totalOrders,
      avgOrderValue: dataSummary.salesSummary.avgOrderValue,
    },
    dailyDetail: buildDailyDetail(snapshot),
    orderVsAov: calculateOrderVsAov(salesData, scope, dataSummary),
    channelBreakdown: dataSummary.channelBreakdown,
    categoryBreakdown: dataSummary.categoryBreakdown,
    daypartBreakdown: dataSummary.daypartBreakdown,
    channelDaily: buildChannelDaily(snapshot.records.channels),
    refundSummary: {
      totalRefund: dataSummary.refundSummary.totalRefund,
      totalCancelled: dataSummary.refundSummary.totalCancelled,
      refundRate:
        dataSummary.salesSummary.totalSales > 0
          ? (dataSummary.refundSummary.totalRefund /
              dataSummary.salesSummary.totalSales) *
            100
          : 0,
    },
    refundDaily: buildRefundDaily(snapshot),
    refundByStore: buildRefundByStore(snapshot),
    managerFeedback: dataSummary.managerFeedback,
    promotionSummary: buildPromotionSummary(snapshot.records.promotions),
  };

  // ---- v2 增强：基准 + 缺口分解 + 因子 + 反馈信号 ----
  const scopeInput = {
    storeIds: scope.targetStoreIds,
    startDate: scope.startDate,
    endDate: scope.endDate,
  };
  const selection = resolveBenchmarkSelection(
    scopeInput,
    readBenchmarkKind()
  );
  const benchmarkSnapshot = createBenchmarkSnapshot(
    salesData,
    scopeInput,
    selection.window,
    selection.storeIds
  );

  const periodAggregate = aggregateFromTotals(snapshot.totals);
  const benchmarkAggregate =
    selection.kind === "target"
      ? {
          ...aggregateFromTotals(benchmarkSnapshot.totals),
          sales: snapshot.totals.target,
          orders: snapshot.totals.orderTarget,
          customers: 0,
          refund: 0,
          cancelled: 0,
          promoSales: 0,
          promoOrders: 0,
        }
      : aggregateFromTotals(benchmarkSnapshot.totals);

  return enrichAttributionV2(base, {
    scope: scopeInput,
    benchmarkKind: selection.kind,
    benchmarkLabel: selection.label,
    benchmarkWindow: selection.window,
    period: periodAggregate,
    benchmark: benchmarkAggregate,
    dimensions: {
      period: dimensionTotalsFromSnapshot(snapshot),
      benchmark:
        selection.kind === "target"
          ? { channel: {}, daypart: {}, category: {} }
          : dimensionTotalsFromSnapshot(benchmarkSnapshot),
    },
    categoryItems: {
      period: categoryItemsFromRecords(snapshot.records),
      benchmark:
        selection.kind === "target"
          ? { orders: 0, items: 0 }
          : categoryItemsFromRecords(benchmarkSnapshot.records),
    },
    refundReasons: refundReasonsFromRecords(snapshot.records),
    feedbackRows: toFeedbackRows(snapshot.records.feedback),
    storeInfo: storeInfoFromMaster(salesData),
  });
}

function createBenchmarkSnapshot(
  sd: SalesData,
  scope: { storeIds: string[]; startDate: string; endDate: string },
  window: { start: string; end: string } | null,
  storeIds: string[]
): ReturnType<typeof createAnalysisSnapshot> {
  if (window) {
    return createAnalysisSnapshot(sd, {
      storeIds,
      startDate: window.start,
      endDate: window.end,
    });
  }
  // historical：使用全量数据（不限制日期范围）
  const dates = sd.store_sales_daily
    .filter((item) => storeIds.includes(item.store_id))
    .map((item) => item.date);
  const startDate = dates.length > 0 ? [...dates].sort()[0] : scope.startDate;
  const endDate = dates.length > 0 ? [...dates].sort().at(-1)! : scope.endDate;
  return createAnalysisSnapshot(sd, {
    storeIds,
    startDate,
    endDate,
  });
}

function toFeedbackRows(
  rows: SalesData["store_manager_feedback"]
): FeedbackInputRow[] {
  return rows.map((row) => ({
    date: row.date,
    storeId: row.store_id,
    type: row.feedback_type,
    detail: row.feedback_detail,
    daypart: row.affected_daypart || "",
    channel: row.affected_channel || "",
  }));
}

export type { AttributionData } from "@/modules/attribution/attribution-types";
