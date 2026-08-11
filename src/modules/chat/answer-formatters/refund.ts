import { money, num, pct } from "@/modules/chat/answer-formatters/format-utils";

export function formatRefundRate(data: Record<string, unknown>): string {
  const byStore = data.byStore as Array<{
    storeId: string;
    storeName: string;
    refundAmount: number;
    cancelledOrders: number;
    refundRate: number;
    cancelRate: number;
  }>;
  const refundRate = data.refundRate as number;
  const cancelRate = data.cancelRate as number;

  return [
    `整体退款率为 **${pct(refundRate)}**，取消率为 **${pct(cancelRate)}**。`,
    "",
    "| 门店 | 退款金额 | 取消订单 | 退款率 | 取消率 |",
    "|---|---:|---:|---:|---:|",
    ...byStore.map(
      (store) =>
        `| ${store.storeName}（${store.storeId}） | ${money(store.refundAmount)} | ${num(store.cancelledOrders)} | ${pct(store.refundRate)} | ${pct(store.cancelRate)} |`
    ),
  ].join("\n");
}
