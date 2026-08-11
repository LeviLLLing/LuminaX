import type {
  PromotionDaily,
  RefundCancelDaily,
  SalesByCategory,
  SalesByChannel,
  SalesByDaypart,
  SalesData,
  SalesTargetDaily,
  StoreManagerFeedback,
  StoreMaster,
  StoreSalesDaily,
} from "@/modules/domain/sales-data";
import {
  getPromotionOrders,
  getPromotionSales,
} from "@/modules/data/sales-data-utils";

export interface AnalysisScope {
  storeIds: string[];
  startDate: string;
  endDate: string;
}

export interface AnalysisRecords {
  sales: StoreSalesDaily[];
  targets: SalesTargetDaily[];
  channels: SalesByChannel[];
  categories: SalesByCategory[];
  dayparts: SalesByDaypart[];
  promotions: PromotionDaily[];
  refunds: RefundCancelDaily[];
  feedback: StoreManagerFeedback[];
}

export interface AnalysisTotals {
  sales: number;
  orders: number;
  customers: number;
  target: number;
  orderTarget: number;
  refund: number;
  salesRecordedRefund: number;
  cancelledOrders: number;
  promotionSales: number;
  promotionOrders: number;
}

export interface AnalysisBreakdowns {
  channel: Record<string, number>;
  category: Record<string, number>;
  daypart: Record<string, number>;
}

export interface StoreAnalysisSnapshot {
  storeId: string;
  store: StoreMaster | null;
  records: AnalysisRecords;
  totals: AnalysisTotals;
  breakdowns: AnalysisBreakdowns;
  byDate: Record<string, DayAnalysisSnapshot>;
}

export interface DayAnalysisSnapshot {
  date: string;
  records: AnalysisRecords;
  totals: AnalysisTotals;
}

export interface AnalysisSnapshot {
  scope: AnalysisScope;
  source: SalesData;
  stores: StoreMaster[];
  storeNames: Record<string, string>;
  dates: string[];
  records: AnalysisRecords;
  totals: AnalysisTotals;
  breakdowns: AnalysisBreakdowns;
  byStore: Record<string, StoreAnalysisSnapshot>;
  byDate: Record<string, DayAnalysisSnapshot>;
}

export function createAnalysisSnapshot(
  source: SalesData,
  scope: AnalysisScope
): AnalysisSnapshot {
  const storeIds = Array.from(new Set(scope.storeIds));
  const normalizedScope = { ...scope, storeIds };
  const storeIdSet = new Set(storeIds);
  const inScope = (item: { store_id: string; date: string }) =>
    storeIdSet.has(item.store_id) &&
    item.date >= scope.startDate &&
    item.date <= scope.endDate;

  const records: AnalysisRecords = {
    sales: source.store_sales_daily.filter(inScope),
    targets: source.sales_target_daily.filter(inScope),
    channels: source.sales_by_channel.filter(inScope),
    categories: source.sales_by_category.filter(inScope),
    dayparts: source.sales_by_daypart.filter(inScope),
    promotions: source.promotion_daily.filter(inScope),
    refunds: source.refund_cancel_daily.filter(inScope),
    feedback: source.store_manager_feedback.filter(inScope),
  };

  const stores = source.store_master.filter((store) =>
    storeIdSet.has(store.store_id)
  );
  const storeNames = Object.fromEntries(
    source.store_master.map((store) => [store.store_id, store.store_name])
  );
  const dates = Array.from(
    new Set([
      ...records.sales.map((item) => item.date),
      ...records.targets.map((item) => item.date),
    ])
  ).sort();

  const groupedByStore = groupRecords(records, (item) => item.store_id);
  const groupedByDate = groupRecords(records, (item) => item.date);

  const byStore = Object.fromEntries(
    storeIds.map((storeId) => {
      const storeRecords = groupedByStore[storeId] || createEmptyRecords();
      return [
        storeId,
        {
          storeId,
          store:
            source.store_master.find((item) => item.store_id === storeId) ||
            null,
          records: storeRecords,
          totals: calculateTotals(storeRecords),
          breakdowns: calculateBreakdowns(storeRecords),
          byDate: createDaySnapshots(storeRecords),
        },
      ];
    })
  );

  const byDate = createDaySnapshots(records, groupedByDate);

  return {
    scope: normalizedScope,
    source,
    stores,
    storeNames,
    dates,
    records,
    totals: calculateTotals(records),
    breakdowns: calculateBreakdowns(records),
    byStore,
    byDate,
  };
}

function createDaySnapshots(
  records: AnalysisRecords,
  groupedRecords: Record<string, AnalysisRecords> = groupRecords(
    records,
    (item) => item.date
  )
): Record<string, DayAnalysisSnapshot> {
  const dates = Array.from(
    new Set([
      ...records.sales.map((item) => item.date),
      ...records.targets.map((item) => item.date),
    ])
  ).sort();

  return Object.fromEntries(
    dates.map((date) => {
      const dayRecords = groupedRecords[date] || createEmptyRecords();
      return [
        date,
        {
          date,
          records: dayRecords,
          totals: calculateTotals(dayRecords),
        },
      ];
    })
  );
}

function groupRecords(
  records: AnalysisRecords,
  getKey: (item: { store_id: string; date: string }) => string
): Record<string, AnalysisRecords> {
  const grouped: Record<string, AnalysisRecords> = {};

  for (const [recordType, items] of Object.entries(records) as Array<
    [keyof AnalysisRecords, AnalysisRecords[keyof AnalysisRecords]]
  >) {
    for (const item of items) {
      const key = getKey(item);
      grouped[key] ||= createEmptyRecords();
      (grouped[key][recordType] as typeof items).push(item as never);
    }
  }

  return grouped;
}

function createEmptyRecords(): AnalysisRecords {
  return {
    sales: [],
    targets: [],
    channels: [],
    categories: [],
    dayparts: [],
    promotions: [],
    refunds: [],
    feedback: [],
  };
}

function calculateTotals(records: AnalysisRecords): AnalysisTotals {
  return {
    sales: sum(records.sales, (item) => item.actual_sales),
    orders: sum(records.sales, (item) => item.order_count),
    customers: sum(records.sales, (item) => item.customer_count),
    target: sum(records.targets, (item) => item.sales_target),
    orderTarget: sum(records.targets, (item) => item.order_target),
    refund: sum(records.refunds, (item) => item.refund_amount),
    salesRecordedRefund: sum(records.sales, (item) => item.refund_amount),
    cancelledOrders: sum(
      records.refunds,
      (item) => item.cancelled_orders
    ),
    promotionSales: sum(records.promotions, getPromotionSales),
    promotionOrders: sum(records.promotions, getPromotionOrders),
  };
}

function calculateBreakdowns(records: AnalysisRecords): AnalysisBreakdowns {
  return {
    channel: aggregateBy(
      records.channels,
      (item) => item.channel,
      (item) => item.sales_amount
    ),
    category: aggregateBy(
      records.categories,
      (item) => item.category,
      (item) => item.sales_amount
    ),
    daypart: aggregateBy(
      records.dayparts,
      (item) => item.daypart,
      (item) => item.sales_amount
    ),
  };
}

function aggregateBy<T>(
  items: T[],
  getKey: (item: T) => string,
  getValue: (item: T) => number
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    result[key] = (result[key] || 0) + getValue(item);
  }
  return result;
}

function sum<T>(items: T[], getValue: (item: T) => number): number {
  return items.reduce((total, item) => total + getValue(item), 0);
}
