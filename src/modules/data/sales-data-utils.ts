import type {
  PromotionDaily,
  RefundCancelDaily,
} from "@/modules/domain/sales-data";

export function getPromotionSales(item: PromotionDaily): number {
  return item.promo_sales ?? item.discount_amount ?? 0;
}

export function getPromotionOrders(item: PromotionDaily): number {
  return item.promo_orders ?? item.promo_units ?? 0;
}

export function getRefundRatePct(
  item: RefundCancelDaily,
  salesAmount: number
): number {
  return (
    item.refund_rate ??
    (salesAmount > 0 ? (item.refund_amount / salesAmount) * 100 : 0)
  );
}
