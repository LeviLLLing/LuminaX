import type {
  RefundCancelDaily,
  SalesByCategory,
  SalesByChannel,
  SalesByDaypart,
  SalesData,
  SalesTargetDaily,
  StoreSalesDaily,
} from "@/modules/domain/sales-data";
import { createAnalysisSnapshot } from "@/modules/analytics/analysis-snapshot";

export interface ChartData {
  salesDaily: StoreSalesDaily[];
  targetsDaily: SalesTargetDaily[];
  channel: SalesByChannel[];
  category: SalesByCategory[];
  daypart: SalesByDaypart[];
  refund: RefundCancelDaily[];
}

export function getChartData(
  storeIds: string[],
  startDate: string,
  endDate: string,
  sd: SalesData
): ChartData {
  const snapshot = createAnalysisSnapshot(sd, {
    storeIds,
    startDate,
    endDate,
  });

  return {
    salesDaily: snapshot.records.sales,
    targetsDaily: snapshot.records.targets,
    channel: snapshot.records.channels,
    category: snapshot.records.categories,
    daypart: snapshot.records.dayparts,
    refund: snapshot.records.refunds,
  };
}
