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
  return {
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
}

export type { AttributionData } from "@/modules/attribution/attribution-types";
