import type { SalesData } from "@/modules/domain/sales-data";
import { createAnalysisSnapshot } from "@/modules/analytics/analysis-snapshot";

export function computeAchievementRate(
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
    const totalSales = storeSnapshot.totals.sales;
    const totalTarget = storeSnapshot.totals.target;
    const gap = totalSales - totalTarget;
    const achievementRate =
      totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0;

    const dailyAchievement = Object.keys(storeSnapshot.byDate)
      .map((date) => {
        const day = storeSnapshot.byDate[date];
        const daySales = day.totals.sales;
        const dayTarget = day.totals.target;
        return {
          date,
          actualSales: daySales,
          salesTarget: dayTarget,
          gap: daySales - dayTarget,
          achievementRate: dayTarget > 0 ? (daySales / dayTarget) * 100 : 0,
        };
      });

    return {
      storeId,
      storeName: storeSnapshot.store?.store_name || storeId,
      totalSales,
      totalTarget,
      gap,
      achievementRate,
      dailyAchievement,
    };
  });

  const totalSales = results.reduce((sum, result) => sum + result.totalSales, 0);
  const totalTarget = results.reduce(
    (sum, result) => sum + result.totalTarget,
    0
  );

  return {
    dateRange: { start: startDate, end: endDate },
    stores: results,
    overall: {
      totalSales,
      totalTarget,
      gap: totalSales - totalTarget,
      achievementRate: totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0,
    },
  };
}
