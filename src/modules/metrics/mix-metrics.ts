import type { SalesData } from "@/modules/domain/sales-data";
import { createAnalysisSnapshot } from "@/modules/analytics/analysis-snapshot";

export function computeChannelMix(
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
  const filteredChannel = snapshot.records.channels;

  const channelPct = buildSalesShare(
    filteredChannel,
    (item) => item.channel
  ).map((item) => ({
    channel: item.name,
    sales: item.sales,
    orders: item.orders,
    salesPct: item.salesPct,
  }));

  const byStore = storeIds.map((storeId) => {
    const storeSnapshot = snapshot.byStore[storeId];
    const storeChannel = storeSnapshot.records.channels;
    const channels = buildSalesShare(storeChannel, (item) => item.channel).map(
      (item) => ({
        channel: item.name,
        sales: item.sales,
        orders: item.orders,
        salesPct: item.salesPct,
      })
    );
    return {
      storeId,
      storeName: storeSnapshot.store?.store_name || storeId,
      channels,
    };
  });

  return { dateRange: { start: startDate, end: endDate }, channelPct, byStore };
}

export function computeDaypartAnalysis(
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
  const filteredDaypart = snapshot.records.dayparts;

  const daypartPct = buildSalesShare(
    filteredDaypart,
    (item) => item.daypart
  ).map((item) => ({
    daypart: item.name,
    sales: item.sales,
    orders: item.orders,
    avgOrderValue: item.orders > 0 ? Math.round(item.sales / item.orders) : 0,
    salesPct: item.salesPct,
  }));

  const byStore = storeIds.map((storeId) => {
    const storeSnapshot = snapshot.byStore[storeId];
    const storeDaypart = storeSnapshot.records.dayparts;
    const dayparts = buildSalesShare(storeDaypart, (item) => item.daypart).map(
      (item) => ({
        daypart: item.name,
        sales: item.sales,
        orders: item.orders,
        avgOrderValue:
          item.orders > 0 ? Math.round(item.sales / item.orders) : 0,
        salesPct: item.salesPct,
      })
    );
    return {
      storeId,
      storeName: storeSnapshot.store?.store_name || storeId,
      dayparts,
    };
  });

  return { dateRange: { start: startDate, end: endDate }, daypartPct, byStore };
}

function buildSalesShare<TItem extends { sales_amount: number; order_count: number }>(
  items: TItem[],
  getName: (item: TItem) => string
) {
  const totals: Record<string, { sales: number; orders: number }> = {};
  items.forEach((item) => {
    const name = getName(item);
    totals[name] ||= { sales: 0, orders: 0 };
    totals[name].sales += item.sales_amount;
    totals[name].orders += item.order_count;
  });

  const grandTotal = Object.values(totals).reduce(
    (sum, item) => sum + item.sales,
    0
  );
  return Object.entries(totals)
    .map(([name, data]) => ({
      name,
      sales: data.sales,
      orders: data.orders,
      salesPct: grandTotal > 0 ? (data.sales / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.sales - a.sales);
}
