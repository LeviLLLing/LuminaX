import type { SalesData } from "@/modules/domain/sales-data";
import {
  createAnalysisSnapshot,
  type AnalysisSnapshot,
} from "@/modules/analytics/analysis-snapshot";
import { summarizeAnalysisSnapshot } from "@/modules/metrics/core-calculations";
import type {
  WeeklyReportBreakdownItem,
  WeeklyReportData,
  WeeklyReportStoreRank,
} from "@/modules/reports/report-model";

interface DailyAggregate {
  sales: number;
  orders: number;
  target: number;
  aov: number[];
}

export function buildWeeklyReportData(
  sd: SalesData,
  startDate: string,
  endDate: string
): WeeklyReportData {
  const allStoreIds = sd.store_master.map((store) => store.store_id);
  const snapshot = createAnalysisSnapshot(sd, {
    storeIds: allStoreIds,
    startDate,
    endDate,
  });
  const summary = summarizeAnalysisSnapshot(snapshot);
  const totalSales = summary.salesSummary.totalSales;
  const totalTarget = summary.salesSummary.totalTarget;
  const achievementRate = totalTarget > 0 ? totalSales / totalTarget : 0;
  const totalOrders = summary.salesSummary.totalOrders;
  const avgAOV = summary.salesSummary.avgOrderValue;
  const totalRefund = summary.refundSummary.totalRefund;
  const refundRate = totalSales > 0 ? totalRefund / totalSales : 0;
  const totalCancel = summary.refundSummary.totalCancelled;
  const totalPromo = snapshot.totals.promotionSales;
  const promoRate = totalSales > 0 ? totalPromo / totalSales : 0;
  const storeRanking = buildStoreRanking(snapshot);
  const dailyMap = buildDailyMap(snapshot);
  const dates = Object.keys(dailyMap).sort();
  const dateLabels = dates.map((date) => date.slice(5));
  const salesTrend = dates.map((date) => dailyMap[date].sales);
  const targetTrend = dates.map((date) => dailyMap[date].target);
  const orderTrend = dates.map((date) => dailyMap[date].orders);
  const aovTrend = dates.map((date) => average(dailyMap[date].aov));
  const { maxDay, minDay, anomalies } = inspectDailySales(dates, dailyMap);

  return {
    startDate,
    endDate,
    generatedTime: createGeneratedTime(),
    storeCount: allStoreIds.length,
    summary,
    totalSales,
    totalTarget,
    achievementRate,
    totalOrders,
    avgAOV,
    totalRefund,
    refundRate,
    totalCancel,
    totalPromo,
    promoRate,
    storeRanking,
    dateLabels,
    salesTrend,
    targetTrend,
    orderTrend,
    aovTrend,
    channelSeries: buildChannelSeries(snapshot, dates),
    channelBreakdown: toBreakdown(summary.channelBreakdown),
    daypartBreakdown: toBreakdown(summary.daypartBreakdown),
    categoryBreakdown: toBreakdown(summary.categoryBreakdown),
    refundReasons: buildRefundReasons(snapshot),
    weekendAvg: averageSalesForDates(
      dates.filter((date) => isWeekend(date)),
      dailyMap
    ),
    weekdayAvg: averageSalesForDates(
      dates.filter((date) => !isWeekend(date)),
      dailyMap
    ),
    weekendVs: calculateWeekendLift(dates, dailyMap),
    maxDay,
    maxDaySales: dailyMap[maxDay]?.sales || 0,
    minDay,
    minDaySales: dailyMap[minDay]?.sales || 0,
    anomalies,
    storeNames: storeRanking.map((store) => store.storeName),
    storeSales: storeRanking.map((store) => store.totalSales),
    storeTargets: storeRanking.map((store) => store.totalTarget),
  };
}

function buildStoreRanking(
  snapshot: AnalysisSnapshot
): WeeklyReportStoreRank[] {
  return snapshot.scope.storeIds
    .map((storeId) => {
      const storeSnapshot = snapshot.byStore[storeId];
      const { store: info, totals } = storeSnapshot;

      return {
        storeId,
        storeName: info?.store_name || storeId,
        region: info?.region || "",
        city: info?.city || "",
        storeType: info?.store_type || "",
        totalSales: totals.sales,
        totalTarget: totals.target,
        achievementRate:
          totals.target > 0 ? totals.sales / totals.target : 0,
        orders: totals.orders,
        avgAOV: totals.orders > 0 ? totals.sales / totals.orders : 0,
        refund: totals.salesRecordedRefund,
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales);
}

function buildDailyMap(
  snapshot: AnalysisSnapshot
): Record<string, DailyAggregate> {
  const dailyMap: Record<string, DailyAggregate> = {};

  for (const date of snapshot.dates) {
    const day = snapshot.byDate[date];
    dailyMap[date] = {
      sales: day.totals.sales,
      orders: day.totals.orders,
      target: day.totals.target,
      aov: day.records.sales.map((item) => item.avg_order_value),
    };
  }

  return dailyMap;
}

function buildChannelSeries(
  snapshot: AnalysisSnapshot,
  dates: string[]
): WeeklyReportData["channelSeries"] {
  const channelTypes = Array.from(
    new Set(snapshot.records.channels.map((item) => item.channel))
  );
  const channelDailyData: Record<string, Record<string, number>> = {};

  for (const item of snapshot.records.channels) {
    channelDailyData[item.date] ||= {};
    channelDailyData[item.date][item.channel] =
      (channelDailyData[item.date][item.channel] || 0) + item.sales_amount;
  }

  return channelTypes.map((channel) => ({
    name: channel,
    type: "line",
    stack: "Total",
    areaStyle: {},
    smooth: true,
    data: dates.map((date) => channelDailyData[date]?.[channel] || 0),
  }));
}

function buildRefundReasons(
  snapshot: AnalysisSnapshot
): WeeklyReportData["refundReasons"] {
  const refundReasonMap: Record<string, { amount: number; orders: number }> = {};
  for (const item of snapshot.records.refunds) {
    const reason = item.main_reason || "其他";
    refundReasonMap[reason] ||= { amount: 0, orders: 0 };
    refundReasonMap[reason].amount += item.refund_amount;
    refundReasonMap[reason].orders += item.cancelled_orders;
  }

  return Object.entries(refundReasonMap)
    .sort(([, a], [, b]) => b.amount - a.amount)
    .map(([reason, data]) => ({
      reason,
      amount: data.amount,
      orders: data.orders,
    }));
}

function toBreakdown(
  breakdown: Record<string, number>
): WeeklyReportBreakdownItem[] {
  const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  return Object.entries(breakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({
      name,
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
    }));
}

function inspectDailySales(
  dates: string[],
  dailyMap: Record<string, DailyAggregate>
): { maxDay: string; minDay: string; anomalies: string[] } {
  if (dates.length === 0) {
    return { maxDay: "", minDay: "", anomalies: [] };
  }

  const maxDay = dates.reduce((currentMax, date) =>
    dailyMap[date].sales > dailyMap[currentMax].sales ? date : currentMax
  );
  const minDay = dates.reduce((currentMin, date) =>
    dailyMap[date].sales < dailyMap[currentMin].sales ? date : currentMin
  );
  const meanSales =
    dates.reduce((sum, date) => sum + dailyMap[date].sales, 0) / dates.length;
  const anomalies = dates.filter(
    (date) => Math.abs(dailyMap[date].sales - meanSales) > meanSales * 0.2
  );

  return { maxDay, minDay, anomalies };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isWeekend(date: string): boolean {
  const day = new Date(date).getDay();
  return day === 0 || day === 6;
}

function averageSalesForDates(
  dates: string[],
  dailyMap: Record<string, DailyAggregate>
): number {
  if (dates.length === 0) return 0;
  return dates.reduce((sum, date) => sum + dailyMap[date].sales, 0) / dates.length;
}

function calculateWeekendLift(
  dates: string[],
  dailyMap: Record<string, DailyAggregate>
): number {
  const weekendAvg = averageSalesForDates(
    dates.filter((date) => isWeekend(date)),
    dailyMap
  );
  const weekdayAvg = averageSalesForDates(
    dates.filter((date) => !isWeekend(date)),
    dailyMap
  );
  return weekdayAvg > 0 ? (weekendAvg / weekdayAvg - 1) * 100 : 0;
}

function createGeneratedTime(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")} ${String(
    now.getHours()
  ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
