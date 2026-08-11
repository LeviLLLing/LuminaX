import type { PromotionDaily } from "@/modules/domain/sales-data";
import type { AnalysisSnapshot } from "@/modules/analytics/analysis-snapshot";
import type { AttributionData } from "@/modules/attribution/attribution-types";
import {
  getPromotionOrders,
  getPromotionSales,
} from "@/modules/data/sales-data-utils";

export interface AttributionFactorScore {
  factor: "orders" | "aov" | "refund" | "promotion";
  score: number;
  reason: string;
}

export function buildRefundByStore(
  snapshot: AnalysisSnapshot
): AttributionData["refundByStore"] {
  return snapshot.scope.storeIds
    .map((storeId) => {
      const storeSnapshot = snapshot.byStore[storeId];
      const { totals } = storeSnapshot;
      return {
        storeId,
        storeName: snapshot.storeNames[storeId] || storeId,
        refundAmount: totals.refund,
        cancelledOrders: totals.cancelledOrders,
        refundRate:
          totals.sales > 0 ? (totals.refund / totals.sales) * 100 : 0,
      };
    })
    .sort((a, b) => b.refundAmount - a.refundAmount);
}

export function buildPromotionSummary(
  filteredPromo: PromotionDaily[]
): AttributionData["promotionSummary"] {
  const promoMap = new Map<string, { discount: number; units: number }>();
  filteredPromo.forEach((item) => {
    const existing = promoMap.get(item.promotion_name) || {
      discount: 0,
      units: 0,
    };
    existing.discount += getPromotionSales(item);
    existing.units += getPromotionOrders(item);
    promoMap.set(item.promotion_name, existing);
  });

  return {
    totalDiscount: filteredPromo.reduce(
      (sum, item) => sum + getPromotionSales(item),
      0
    ),
    totalPromoUnits: filteredPromo.reduce(
      (sum, item) => sum + getPromotionOrders(item),
      0
    ),
    promoCount: promoMap.size,
    topPromotions: Array.from(promoMap.entries())
      .map(([name, data]) => ({
        promotion_name: name,
        promo_sales: data.discount,
        promo_orders: data.units,
      }))
      .sort((a, b) => b.promo_sales - a.promo_sales)
      .slice(0, 5),
  };
}

export function scoreAttributionFactors(
  data: AttributionData
): AttributionFactorScore[] {
  const scores: AttributionFactorScore[] = [
    {
      factor: "orders",
      score: Math.abs(data.orderVsAov.ordersDrop),
      reason: "订单量相对历史均值的偏离幅度",
    },
    {
      factor: "aov",
      score: Math.abs(data.orderVsAov.aovDrop),
      reason: "客单价相对历史均值的偏离幅度",
    },
    {
      factor: "refund",
      score: data.refundSummary.refundRate,
      reason: "退款率对销售净额的影响",
    },
    {
      factor: "promotion",
      score:
        data.salesSummary.totalSales > 0
          ? (data.promotionSummary.totalDiscount /
              data.salesSummary.totalSales) *
            100
          : 0,
      reason: "促销销售占整体销售的比例",
    },
  ];

  return scores.sort((a, b) => b.score - a.score);
}
