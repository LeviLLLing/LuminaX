import type { SalesData } from "@/modules/domain/sales-data";
import { createAnalysisSnapshot } from "@/modules/analytics/analysis-snapshot";

export function computeRefundRate(
  storeIds: string[],
  startDate: string,
  endDate: string,
  salesData: SalesData
) {
  const snapshot = createAnalysisSnapshot(salesData, {
    storeIds,
    startDate,
    endDate,
  });
  const filteredRefund = snapshot.records.refunds;
  const totalSales = snapshot.totals.sales;
  const totalRefund = snapshot.totals.refund;
  const totalCancelled = snapshot.totals.cancelledOrders;
  const totalOrders = snapshot.totals.orders;

  const dates = Array.from(new Set(filteredRefund.map((item) => item.date))).sort();
  const dailyRefund = dates.map((date) => {
    const day = snapshot.byDate[date];
    const refundAmount = day.totals.refund;
    const cancelledOrders = day.totals.cancelledOrders;
    const salesAmount = day.totals.sales;
    const orders = day.totals.orders;
    return {
      date,
      refundAmount,
      cancelledOrders,
      refundRate: salesAmount > 0 ? (refundAmount / salesAmount) * 100 : 0,
      cancelRate: orders > 0 ? (cancelledOrders / orders) * 100 : 0,
    };
  });

  const byStore = storeIds
    .map((storeId) => {
      const storeSnapshot = snapshot.byStore[storeId];
      const storeSalesAmount = storeSnapshot.totals.sales;
      const storeRefundAmount = storeSnapshot.totals.refund;
      const storeCancelled = storeSnapshot.totals.cancelledOrders;
      const storeOrders = storeSnapshot.totals.orders;
      return {
        storeId,
        storeName: storeSnapshot.store?.store_name || storeId,
        totalSales: storeSalesAmount,
        refundAmount: storeRefundAmount,
        cancelledOrders: storeCancelled,
        refundRate:
          storeSalesAmount > 0
            ? (storeRefundAmount / storeSalesAmount) * 100
            : 0,
        cancelRate: storeOrders > 0 ? (storeCancelled / storeOrders) * 100 : 0,
      };
    })
    .sort((a, b) => b.refundRate - a.refundRate);

  return {
    dateRange: { start: startDate, end: endDate },
    totalSales,
    totalRefund,
    totalCancelled,
    totalOrders,
    refundRate: totalSales > 0 ? (totalRefund / totalSales) * 100 : 0,
    cancelRate: totalOrders > 0 ? (totalCancelled / totalOrders) * 100 : 0,
    dailyRefund,
    byStore,
  };
}
