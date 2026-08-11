import { money, num, pct } from "@/modules/chat/answer-formatters/format-utils";

export function formatOrderTrend(data: Record<string, unknown>): string {
  const stores = data.stores as Array<{
    storeId: string;
    storeName: string;
    totalOrders: number;
    totalOrderTarget: number;
    orderAchievementRate: number;
    trendDirection: string;
    trendPct: number;
  }>;

  return [
    "订单趋势已完成计算，重点看订单量是否达标，以及后半周期相对前半周期的变化。",
    "",
    "| 门店 | 订单量 | 订单目标 | 达成率 | 趋势 | 变化幅度 |",
    "|---|---:|---:|---:|---|---:|",
    ...stores.map(
      (store) =>
        `| ${store.storeName}（${store.storeId}） | ${num(store.totalOrders)} | ${num(store.totalOrderTarget)} | ${pct(store.orderAchievementRate)} | ${store.trendDirection} | ${pct(store.trendPct)} |`
    ),
  ].join("\n");
}

export function formatAovTrend(data: Record<string, unknown>): string {
  const stores = data.stores as Array<{
    storeId: string;
    storeName: string;
    avgAOV: number;
    targetAOV: number;
    aovGap: number;
    trendDirection: string;
    trendPct: number;
  }>;

  return [
    "客单价趋势已完成计算，重点看实际 AOV 与目标 AOV 的差距。",
    "",
    "| 门店 | 平均客单价 | 目标客单价 | 差距 | 趋势 | 变化幅度 |",
    "|---|---:|---:|---:|---|---:|",
    ...stores.map(
      (store) =>
        `| ${store.storeName}（${store.storeId}） | ${money(store.avgAOV)} | ${money(store.targetAOV)} | ${money(store.aovGap)} | ${store.trendDirection} | ${pct(store.trendPct)} |`
    ),
  ].join("\n");
}
