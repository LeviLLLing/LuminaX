import type { SalesData } from "@/modules/domain/sales-data";
import { buildWeeklyReportData } from "@/modules/reports/report-data-builder";
import { renderWeeklyReportMarkdown } from "@/modules/reports/report-markdown";
import { renderWeeklyReportHtml } from "@/modules/reports/weekly-report-template";
import { reportInsightGenerator } from "@/modules/reports/report-insight-composition";
import type {
  ReportInsights,
  WeeklyReportData,
} from "@/modules/reports/report-model";

export interface ReportInsightGenerator {
  generateInsights(data: WeeklyReportData): Promise<ReportInsights>;
}

export function generateWeeklyReportSummary(
  startDate: string,
  endDate: string,
  salesData: SalesData,
  storeIds?: string[]
): string {
  return renderWeeklyReportMarkdown(
    buildWeeklyReportData(salesData, startDate, endDate, storeIds)
  );
}

export async function generateWeeklyReportHTML(
  sd: SalesData,
  startDate = "2025-05-01",
  endDate = "2025-05-14",
  storeIds?: string[],
  insightGenerator: ReportInsightGenerator = reportInsightGenerator
): Promise<string> {
  const data = buildWeeklyReportData(sd, startDate, endDate, storeIds);
  const insights = await insightGenerator.generateInsights(data);
  return renderWeeklyReportHtml(data, insights);
}

export type {
  WeeklyReportBreakdownItem,
  WeeklyReportData,
  WeeklyReportStoreRank,
} from "@/modules/reports/report-model";
