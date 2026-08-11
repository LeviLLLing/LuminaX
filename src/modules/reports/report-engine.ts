import type { SalesData } from "@/modules/domain/sales-data";
import { buildWeeklyReportData } from "@/modules/reports/report-data-builder";
import { renderWeeklyReportMarkdown } from "@/modules/reports/report-markdown";
import { renderWeeklyReportHtml } from "@/modules/reports/weekly-report-template";

export function generateWeeklyReportSummary(
  startDate: string,
  endDate: string,
  salesData: SalesData
): string {
  return renderWeeklyReportMarkdown(
    buildWeeklyReportData(salesData, startDate, endDate)
  );
}

export function generateWeeklyReportHTML(
  sd: SalesData,
  startDate = "2025-05-01",
  endDate = "2025-05-14"
): string {
  return renderWeeklyReportHtml(buildWeeklyReportData(sd, startDate, endDate));
}

export type {
  WeeklyReportBreakdownItem,
  WeeklyReportData,
  WeeklyReportStoreRank,
} from "@/modules/reports/report-model";
