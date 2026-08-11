import { money, num } from "@/modules/chat/answer-formatters/format-utils";

export function formatCompare(data: Record<string, unknown>): string {
  const stores = data.stores as Array<{
    storeId: string;
    storeName: string;
    totalSales: number;
    totalTarget: number;
    achievementRate: string;
    totalOrders: number;
    avgOrderValue: number;
    refundRate: string;
  }>;

  return [
    "门店对比已完成，优先看销售额、达成率、订单量、客单价和退款率。",
    "",
    `| 指标 | ${stores.map((store) => `${store.storeName}（${store.storeId}）`).join(" | ")} |`,
    `|---${stores.map(() => "|---:").join("")}|`,
    `| 销售额 | ${stores.map((store) => money(store.totalSales)).join(" | ")} |`,
    `| 目标 | ${stores.map((store) => money(store.totalTarget)).join(" | ")} |`,
    `| 达成率 | ${stores.map((store) => store.achievementRate).join(" | ")} |`,
    `| 订单量 | ${stores.map((store) => num(store.totalOrders)).join(" | ")} |`,
    `| 客单价 | ${stores.map((store) => money(store.avgOrderValue)).join(" | ")} |`,
    `| 退款率 | ${stores.map((store) => store.refundRate).join(" | ")} |`,
  ].join("\n");
}
