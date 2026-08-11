import type { SalesData } from "@/modules/domain/sales-data";
import { createAnalysisSnapshot } from "@/modules/analytics/analysis-snapshot";
import { getRefundRatePct } from "@/modules/data/sales-data-utils";

export function computeAnomalyDetection(
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

  const results = storeIds.map((storeId) => {
    const storeSnapshot = snapshot.byStore[storeId];
    const sales = storeSnapshot.records.sales;
    const salesValues = sales.map((item) => item.actual_sales);
    const mean = average(salesValues);
    const stdDev =
      salesValues.length > 1
        ? Math.sqrt(
            salesValues.reduce(
              (sum, value) => sum + Math.pow(value - mean, 2),
              0
            ) /
              (salesValues.length - 1)
          )
        : 0;

    const anomalyDays = sales
      .map((day) => {
        const daySnapshot = storeSnapshot.byDate[day.date];
        const dayTarget = daySnapshot.records.targets[0];
        const dayRefund = daySnapshot.records.refunds[0];
        const targetRate = dayTarget
          ? (day.actual_sales / dayTarget.sales_target) * 100
          : 100;
        const zScore = stdDev > 0 ? (day.actual_sales - mean) / stdDev : 0;
        const reasons: string[] = [];

        if (targetRate < 90) reasons.push(`达成率仅 ${targetRate.toFixed(1)}%`);
        if (zScore < -1.5) {
          reasons.push(`销售额显著低于均值 (Z=${zScore.toFixed(2)})`);
        }
        if (zScore > 1.5) {
          reasons.push(`销售额显著高于均值 (Z=${zScore.toFixed(2)})`);
        }
        if (dayRefund && getRefundRatePct(dayRefund, day.actual_sales) > 2) {
          reasons.push(
            `退款率偏高 (${getRefundRatePct(
              dayRefund,
              day.actual_sales
            ).toFixed(2)}%)`
          );
        }
        if (dayRefund && dayRefund.cancelled_orders > 15) {
          reasons.push(`取消订单偏多 (${dayRefund.cancelled_orders}笔)`);
        }

        return {
          date: day.date,
          actualSales: day.actual_sales,
          salesTarget: dayTarget?.sales_target || 0,
          achievementRate: targetRate,
          orderCount: day.order_count,
          avgOrderValue: day.avg_order_value,
          refundAmount: day.refund_amount,
          cancelledOrders: day.cancelled_orders,
          zScore: Math.round(zScore * 100) / 100,
          isAnomaly: reasons.length > 0,
          reasons,
        };
      })
      .filter((day) => day.isAnomaly);

    return {
      storeId,
      storeName: storeSnapshot.store?.store_name || storeId,
      meanSales: Math.round(mean),
      stdDev: Math.round(stdDev),
      anomalyDays,
      anomalyCount: anomalyDays.length,
    };
  });

  return { dateRange: { start: startDate, end: endDate }, stores: results };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
