import { money, pct } from "@/modules/chat/answer-formatters/format-utils";

export function formatAchievementRate(data: Record<string, unknown>): string {
  const overall = data.overall as {
    totalSales: number;
    totalTarget: number;
    gap: number;
    achievementRate: number;
  };
  const stores = data.stores as Array<{
    storeId: string;
    storeName: string;
    totalSales: number;
    totalTarget: number;
    gap: number;
    achievementRate: number;
  }>;

  return [
    `整体销售达成率为 **${pct(overall.achievementRate)}**，销售额 ${money(overall.totalSales)}，目标 ${money(overall.totalTarget)}，差距 ${money(overall.gap)}。`,
    "",
    "| 门店 | 销售额 | 目标 | 差距 | 达成率 |",
    "|---|---:|---:|---:|---:|",
    ...stores.map(
      (store) =>
        `| ${store.storeName}（${store.storeId}） | ${money(store.totalSales)} | ${money(store.totalTarget)} | ${money(store.gap)} | ${pct(store.achievementRate)} |`
    ),
  ].join("\n");
}
