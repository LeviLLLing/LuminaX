import type {
  AnalysisRecords,
  AnalysisSnapshot,
  AnalysisTotals,
} from "@/modules/analytics/analysis-snapshot";
import {
  getPromotionOrders,
  getPromotionSales,
} from "@/modules/data/sales-data-utils";
import type { BenchmarkKind } from "@/modules/attribution/attribution-types";

export interface AttributionScope {
  storeIds: string[];
  startDate: string;
  endDate: string;
}

export interface BenchmarkSelection {
  kind: BenchmarkKind;
  label: string;
  /** null 表示使用全量数据作为基准（historical） */
  window: { start: string; end: string } | null;
  storeIds: string[];
}

export interface AttributionAggregate {
  sales: number;
  orders: number;
  customers: number;
  target: number;
  orderTarget: number;
  refund: number;
  cancelled: number;
  promoSales: number;
  promoOrders: number;
}

export interface AttributionDimensionTotals {
  channel: Record<string, number>;
  daypart: Record<string, number>;
  category: Record<string, number>;
}

const BENCHMARK_LABELS: Record<BenchmarkKind, string> = {
  target: "目标基准",
  historical: "全周期平均基准",
  last_week: "上周同期",
  same_weekday: "上周同日（剔除星期效应）",
  peer_group: "同业态门店横向基准",
};

export function readBenchmarkKind(
  fallback: BenchmarkKind = "target"
): BenchmarkKind {
  const value = process.env.LUMINAX_ATTRIBUTION_BENCHMARK?.trim() as
    | BenchmarkKind
    | undefined;
  return value && value in BENCHMARK_LABELS ? value : fallback;
}

export function benchmarkLabel(kind: BenchmarkKind): string {
  return BENCHMARK_LABELS[kind];
}

export function resolveBenchmarkSelection(
  scope: AttributionScope,
  kind: BenchmarkKind,
  peerStoreIds: string[] = scope.storeIds
): BenchmarkSelection {
  const label = BENCHMARK_LABELS[kind];
  switch (kind) {
    case "target":
      return {
        kind,
        label,
        window: { start: scope.startDate, end: scope.endDate },
        storeIds: scope.storeIds,
      };
    case "historical":
      return { kind, label, window: null, storeIds: scope.storeIds };
    case "last_week":
    case "same_weekday":
      return {
        kind,
        label,
        window: shiftWindow(scope.startDate, scope.endDate, -7),
        storeIds: scope.storeIds,
      };
    case "peer_group":
      return {
        kind,
        label,
        window: { start: scope.startDate, end: scope.endDate },
        storeIds: peerStoreIds,
      };
  }
}

export function shiftWindow(
  startDate: string,
  endDate: string,
  days: number
): { start: string; end: string } {
  return {
    start: shiftDate(startDate, days),
    end: shiftDate(endDate, days),
  };
}

export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day) + days * 86_400_000;
  const shifted = new Date(utc);
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function dayCount(startDate: string, endDate: string): number {
  if (startDate === endDate) return 1;
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const diff =
    (Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000 + 1;
  return Math.max(1, diff);
}

export function createEmptyAggregate(): AttributionAggregate {
  return {
    sales: 0,
    orders: 0,
    customers: 0,
    target: 0,
    orderTarget: 0,
    refund: 0,
    cancelled: 0,
    promoSales: 0,
    promoOrders: 0,
  };
}

export function aggregateFromTotals(
  totals: AnalysisTotals
): AttributionAggregate {
  return {
    sales: totals.sales,
    orders: totals.orders,
    customers: totals.customers,
    target: totals.target,
    orderTarget: totals.orderTarget,
    refund: totals.refund,
    cancelled: totals.cancelledOrders,
    promoSales: totals.promotionSales,
    promoOrders: totals.promotionOrders,
  };
}

export function dimensionTotalsFromSnapshot(
  snapshot: AnalysisSnapshot
): AttributionDimensionTotals {
  return {
    channel: { ...snapshot.breakdowns.channel },
    daypart: { ...snapshot.breakdowns.daypart },
    category: { ...snapshot.breakdowns.category },
  };
}

export function categoryItemsFromRecords(
  records: AnalysisRecords
): { orders: number; items: number } {
  return {
    orders: records.categories.reduce(
      (sum, item) => sum + (item.order_count || 0),
      0
    ),
    items: records.categories.reduce(
      (sum, item) => sum + (item.item_count || 0),
      0
    ),
  };
}

export function promoFromRecords(
  records: AnalysisRecords
): { sales: number; orders: number } {
  return {
    sales: records.promotions.reduce(
      (sum, item) => sum + getPromotionSales(item),
      0
    ),
    orders: records.promotions.reduce(
      (sum, item) => sum + getPromotionOrders(item),
      0
    ),
  };
}

export function refundReasonsFromRecords(
  records: AnalysisRecords
): Array<{ reason: string; amount: number; orders: number }> {
  const map = new Map<string, { amount: number; orders: number }>();
  for (const item of records.refunds) {
    const reason = item.main_reason?.trim() || "其他";
    const current = map.get(reason) || { amount: 0, orders: 0 };
    current.amount += item.refund_amount || 0;
    current.orders += item.refund_orders || 0;
    map.set(reason, current);
  }
  return [...map.entries()]
    .map(([reason, data]) => ({ reason, ...data }))
    .sort((a, b) => b.amount - a.amount);
}

export function storeInfoFromMaster(
  salesData: { store_master: Array<{ store_id: string; store_type: string; opening_date: string }> }
): Record<string, { storeType: string; openingDate: string }> {
  return Object.fromEntries(
    salesData.store_master.map((store) => [
      store.store_id,
      { storeType: store.store_type, openingDate: store.opening_date },
    ])
  );
}
