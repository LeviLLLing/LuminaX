import type { SalesData } from "@/modules/domain/sales-data";
import { createAnalysisSnapshot } from "@/modules/analytics/analysis-snapshot";

export function computeOrderTrend(
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
    const totalOrders = storeSnapshot.totals.orders;
    const totalOrderTarget = storeSnapshot.totals.orderTarget;
    const dailyOrders = Object.keys(storeSnapshot.byDate)
      .map((date) => {
        const day = storeSnapshot.byDate[date];
        const orders = day.totals.orders;
        const orderTarget = day.totals.orderTarget;
        return { date, orders, orderTarget };
      });

    const trend = calculateSplitTrend(
      dailyOrders.map((day) => day.orders),
      0.05
    );

    return {
      storeId,
      storeName: storeSnapshot.store?.store_name || storeId,
      totalOrders,
      totalOrderTarget,
      orderAchievementRate:
        totalOrderTarget > 0 ? (totalOrders / totalOrderTarget) * 100 : 0,
      dailyOrders,
      trendDirection: trend.direction,
      trendPct: trend.pct,
    };
  });

  return { dateRange: { start: startDate, end: endDate }, stores: results };
}

export function computeAOVTrend(
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
    const targets = storeSnapshot.records.targets;
    const totalSales = storeSnapshot.totals.sales;
    const totalOrders = storeSnapshot.totals.orders;
    const avgAOV = totalOrders > 0 ? totalSales / totalOrders : 0;
    const targetAOV =
      targets.length > 0
        ? targets.reduce((sum, item) => sum + item.aov_target, 0) /
          targets.length
        : 0;

    const dailyAOV = Object.keys(storeSnapshot.byDate)
      .map((date) => {
        const day = storeSnapshot.byDate[date];
        const dayTargets = day.records.targets;
        const dayTotalSales = day.totals.sales;
        const dayTotalOrders = day.totals.orders;
        const aov = dayTotalOrders > 0 ? dayTotalSales / dayTotalOrders : 0;
        const aovTarget =
          dayTargets.length > 0
            ? dayTargets.reduce((sum, item) => sum + item.aov_target, 0) /
              dayTargets.length
            : 0;
        return {
          date,
          aov: Math.round(aov * 100) / 100,
          aovTarget: Math.round(aovTarget * 100) / 100,
        };
      });

    const trend = calculateSplitTrend(
      dailyAOV.map((day) => day.aov),
      0.03
    );

    return {
      storeId,
      storeName: storeSnapshot.store?.store_name || storeId,
      avgAOV: Math.round(avgAOV * 100) / 100,
      targetAOV: Math.round(targetAOV * 100) / 100,
      aovGap: Math.round((avgAOV - targetAOV) * 100) / 100,
      dailyAOV,
      trendDirection: trend.direction,
      trendPct: trend.pct,
    };
  });

  return { dateRange: { start: startDate, end: endDate }, stores: results };
}

function calculateSplitTrend(
  values: number[],
  tolerance: number
): { direction: "上升" | "下降" | "持平"; pct: number } {
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avgFirst = average(firstHalf);
  const avgSecond = average(secondHalf);

  return {
    direction:
      avgSecond > avgFirst * (1 + tolerance)
        ? "上升"
        : avgSecond < avgFirst * (1 - tolerance)
          ? "下降"
          : "持平",
    pct: avgFirst > 0 ? ((avgSecond - avgFirst) / avgFirst) * 100 : 0,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
