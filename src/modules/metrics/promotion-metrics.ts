import type { PromotionDaily, SalesData } from "@/modules/domain/sales-data";
import { createAnalysisSnapshot } from "@/modules/analytics/analysis-snapshot";
import {
  getPromotionOrders,
  getPromotionSales,
} from "@/modules/data/sales-data-utils";

export function computePromotionContribution(
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
  const filteredPromo = snapshot.records.promotions;
  const totalSales = snapshot.totals.sales;
  const totalDiscount = snapshot.totals.promotionSales;
  const totalPromoUnits = snapshot.totals.promotionOrders;
  const promotionDetails = summarizePromotions(filteredPromo, totalSales).map(
    (item) => ({
      promotionName: item.name,
      discountAmount: item.discount,
      promoUnits: item.units,
      discountPct: item.discountPct,
    })
  );

  const byStore = storeIds.map((storeId) => {
    const storeSnapshot = snapshot.byStore[storeId];
    const storePromo = storeSnapshot.records.promotions;
    const storeTotalSales = storeSnapshot.totals.sales;
    const storeTotalDiscount = storeSnapshot.totals.promotionSales;
    const storeTotalPromoUnits = storeSnapshot.totals.promotionOrders;

    return {
      storeId,
      storeName: storeSnapshot.store?.store_name || storeId,
      totalSales: storeTotalSales,
      totalDiscount: storeTotalDiscount,
      totalPromoUnits: storeTotalPromoUnits,
      contributionRate:
        storeTotalSales > 0 ? (storeTotalDiscount / storeTotalSales) * 100 : 0,
      promotions: summarizePromotions(storePromo, storeTotalSales).map(
        (item) => ({
          promotionName: item.name,
          discountAmount: item.discount,
          promoUnits: item.units,
        })
      ),
    };
  });

  return {
    dateRange: { start: startDate, end: endDate },
    totalSales,
    totalDiscount,
    totalPromoUnits,
    contributionRate: totalSales > 0 ? (totalDiscount / totalSales) * 100 : 0,
    promotionDetails,
    byStore,
  };
}

function summarizePromotions(items: PromotionDaily[], totalSales: number) {
  const promoMap = new Map<string, { discount: number; units: number }>();
  items.forEach((item) => {
    const existing = promoMap.get(item.promotion_name) || {
      discount: 0,
      units: 0,
    };
    existing.discount += getPromotionSales(item);
    existing.units += getPromotionOrders(item);
    promoMap.set(item.promotion_name, existing);
  });

  return Array.from(promoMap.entries())
    .map(([name, data]) => ({
      name,
      discount: data.discount,
      units: data.units,
      discountPct: totalSales > 0 ? (data.discount / totalSales) * 100 : 0,
    }))
    .sort((a, b) => b.discount - a.discount);
}
