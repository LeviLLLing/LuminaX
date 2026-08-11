import type { DataSummary } from "@/modules/domain/analysis-types";
import type { SalesData } from "@/modules/domain/sales-data";
import {
  createAnalysisSnapshot,
  type AnalysisSnapshot,
} from "@/modules/analytics/analysis-snapshot";

export function computeDataSummary(
  storeIds: string[],
  startDate: string,
  endDate: string,
  salesData: SalesData
): DataSummary {
  return summarizeAnalysisSnapshot(
    createAnalysisSnapshot(salesData, { storeIds, startDate, endDate })
  );
}

export function summarizeAnalysisSnapshot(
  snapshot: AnalysisSnapshot
): DataSummary {
  const { scope, totals, breakdowns, records } = snapshot;
  const achievementRate =
    totals.target > 0
      ? ((totals.sales / totals.target) * 100).toFixed(1) + "%"
      : "N/A";

  return {
    dateRange: { start: scope.startDate, end: scope.endDate },
    stores: scope.storeIds,
    salesSummary: {
      totalSales: totals.sales,
      totalOrders: totals.orders,
      totalTarget: totals.target,
      achievementRate,
      avgOrderValue:
        totals.orders > 0 ? Math.round(totals.sales / totals.orders) : 0,
    },
    channelBreakdown: breakdowns.channel,
    categoryBreakdown: breakdowns.category,
    daypartBreakdown: breakdowns.daypart,
    refundSummary: {
      totalRefund: totals.refund,
      totalCancelled: totals.cancelledOrders,
    },
    managerFeedback: records.feedback.map((f) => ({
      date: f.date,
      store_id: f.store_id,
      feedback_type: f.feedback_type,
      feedback_detail: f.feedback_detail,
      affected_daypart: f.affected_daypart ?? "",
      affected_channel: f.affected_channel ?? "",
      manager_name: f.manager_name ?? "",
    })),
  };
}

export interface StoreCompareItem {
  storeId: string;
  storeName: string;
  totalSales: number;
  totalTarget: number;
  achievementRate: string;
  totalOrders: number;
  avgOrderValue: number;
  totalRefund: number;
  totalCancelled: number;
  refundRate: string;
  channelBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
  daypartBreakdown: Record<string, number>;
  dailySales: { date: string; actual_sales: number; sales_target: number }[];
}

export interface CompareData {
  dateRange: { start: string; end: string };
  stores: StoreCompareItem[];
  anomalies: {
    date: string;
    store_id: string;
    feedback_type: string;
    feedback_detail: string;
    affected_daypart: string;
    affected_channel: string;
  }[];
}

export function computeCompareData(
  storeIds: string[],
  startDate: string,
  endDate: string,
  salesData: SalesData
): CompareData {
  const snapshot = createAnalysisSnapshot(salesData, {
    storeIds,
    startDate,
    endDate,
  });

  const stores: StoreCompareItem[] = storeIds.map((sid) => {
    const storeSnapshot = snapshot.byStore[sid];
    const { records, totals, breakdowns } = storeSnapshot;
    const dailySales = records.sales.map((r) => {
      const target = records.targets.find((t) => t.date === r.date);
      return { date: r.date, actual_sales: r.actual_sales, sales_target: target?.sales_target ?? 0 };
    }).sort((a, b) => a.date.localeCompare(b.date));

    return {
      storeId: sid,
      storeName: storeSnapshot.store?.store_name || sid,
      totalSales: totals.sales,
      totalTarget: totals.target,
      achievementRate: totals.target > 0 ? ((totals.sales / totals.target) * 100).toFixed(1) + "%" : "N/A",
      totalOrders: totals.orders,
      avgOrderValue: totals.orders > 0 ? Math.round(totals.sales / totals.orders) : 0,
      totalRefund: totals.refund,
      totalCancelled: totals.cancelledOrders,
      refundRate: totals.sales > 0 ? ((totals.refund / totals.sales) * 100).toFixed(2) + "%" : "N/A",
      channelBreakdown: breakdowns.channel,
      categoryBreakdown: breakdowns.category,
      daypartBreakdown: breakdowns.daypart,
      dailySales,
    };
  });

  const anomalies = snapshot.records.feedback.map((f) => ({
    date: f.date,
    store_id: f.store_id,
    feedback_type: f.feedback_type,
    feedback_detail: f.feedback_detail,
    affected_daypart: f.affected_daypart ?? "",
    affected_channel: f.affected_channel ?? "",
  }));

  return { dateRange: { start: startDate, end: endDate }, stores, anomalies };
}

export function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "万";
  }
  return num.toLocaleString();
}

export function computeStoreRanking(
  storeIds: string[],
  startDate: string,
  endDate: string,
  salesData: SalesData
): Array<{ storeId: string; storeName: string; totalSales: number; achievementRate: string }> {
  const snapshot = createAnalysisSnapshot(salesData, {
    storeIds,
    startDate,
    endDate,
  });

  return Object.values(snapshot.byStore)
    .map(({ storeId, store, totals }) => ({
      storeId,
      storeName: store?.store_name || storeId,
      totalSales: totals.sales,
      achievementRate:
        totals.target > 0
          ? ((totals.sales / totals.target) * 100).toFixed(1) + "%"
          : "N/A",
    }))
    .sort((a, b) => b.totalSales - a.totalSales);
}
