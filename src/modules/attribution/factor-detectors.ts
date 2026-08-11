import type {
  DataSummary,
  Entities,
} from "@/modules/domain/analysis-types";
import type {
  SalesByChannel,
  SalesData,
} from "@/modules/domain/sales-data";
import type { AnalysisSnapshot } from "@/modules/analytics/analysis-snapshot";
import type { AttributionData } from "@/modules/attribution/attribution-types";

export interface AttributionScope {
  targetStoreIds: string[];
  startDate: string;
  endDate: string;
  storeNames: Record<string, string>;
}

export function resolveAttributionScope(
  sd: SalesData,
  entities: Entities,
  defaultStartDate: string,
  defaultEndDate: string
): AttributionScope {
  const storeNames = Object.fromEntries(
    sd.store_master.map((store) => [store.store_id, store.store_name])
  );

  return {
    targetStoreIds:
      entities.storeIds.length > 0
        ? entities.storeIds
        : sd.store_master.map((store) => store.store_id),
    startDate: entities.startDate || defaultStartDate,
    endDate: entities.endDate || defaultEndDate,
    storeNames,
  };
}

export function buildDailyDetail(
  snapshot: AnalysisSnapshot
): AttributionData["dailyDetail"] {
  return snapshot.dates.map((date) => {
    const day = snapshot.byDate[date];
    const actualSales = day.totals.sales;
    const salesTarget = day.totals.target;
    const orderCount = day.totals.orders;
    return {
      date,
      actualSales,
      salesTarget,
      achievementRate: salesTarget > 0 ? (actualSales / salesTarget) * 100 : 0,
      orderCount,
      avgOrderValue: orderCount > 0 ? actualSales / orderCount : 0,
    };
  });
}

export function calculateOrderVsAov(
  sd: SalesData,
  scope: AttributionScope,
  dataSummary: DataSummary
): AttributionData["orderVsAov"] {
  const allSales = sd.store_sales_daily.filter((item) =>
    scope.targetStoreIds.includes(item.store_id)
  );
  const avgDailySales =
    allSales.reduce((sum, item) => sum + item.actual_sales, 0) /
    Math.max(allSales.length, 1);
  const avgDailyOrders =
    allSales.reduce((sum, item) => sum + item.order_count, 0) /
    Math.max(allSales.length, 1);
  const avgAOV =
    allSales.reduce((sum, item) => sum + item.avg_order_value, 0) /
    Math.max(allSales.length, 1);
  const dayCount = calculateDayCount(scope.startDate, scope.endDate);
  const actualDailySales = dataSummary.salesSummary.totalSales / dayCount;
  const actualDailyOrders = dataSummary.salesSummary.totalOrders / dayCount;
  const salesDrop = avgDailySales - actualDailySales;
  const ordersDrop = avgDailyOrders - actualDailyOrders;
  const aovDrop = avgAOV - dataSummary.salesSummary.avgOrderValue;

  return {
    avgDailySales,
    avgDailyOrders,
    avgAOV,
    actualDailySales,
    actualDailyOrders,
    salesDrop,
    ordersDrop,
    aovDrop,
    mainIssue: inferMainIssue(ordersDrop, aovDrop),
  };
}

export function buildChannelDaily(
  channels: SalesByChannel[]
): AttributionData["channelDaily"] {
  return channels.map((item) => ({
      date: item.date,
      channel: item.channel,
      salesAmount: item.sales_amount,
      orderCount: item.order_count,
    }));
}

export function buildRefundDaily(
  snapshot: AnalysisSnapshot
): AttributionData["refundDaily"] {
  return snapshot.dates.map((date) => {
    const day = snapshot.byDate[date];
    return {
      date,
      refundAmount: day.totals.refund,
      refundRate:
        day.totals.sales > 0
          ? (day.totals.refund / day.totals.sales) * 100
          : 0,
      cancelledOrders: day.totals.cancelledOrders,
    };
  });
}

function calculateDayCount(startDate: string, endDate: string): number {
  if (startDate === endDate) return 1;
  return Math.max(
    1,
    (new Date(endDate).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24) +
      1
  );
}

function inferMainIssue(
  ordersDrop: number,
  aovDrop: number
): AttributionData["orderVsAov"]["mainIssue"] {
  if (Math.abs(ordersDrop) > 1 && Math.abs(aovDrop) > 1) return "both";
  if (Math.abs(ordersDrop) > Math.abs(aovDrop)) {
    return ordersDrop < 0 ? "none" : "orders";
  }
  return aovDrop > 0 ? "none" : "aov";
}
