import type { DataSummary } from "@/modules/domain/analysis-types";

export interface WeeklyReportStoreRank {
  storeId: string;
  storeName: string;
  region: string;
  city: string;
  storeType: string;
  totalSales: number;
  totalTarget: number;
  achievementRate: number;
  orders: number;
  avgAOV: number;
  refund: number;
}

export interface WeeklyReportBreakdownItem {
  name: string;
  value: number;
  pct: number;
}

export type ReportAttentionSeverity =
  | "high"
  | "medium"
  | "low"
  | "positive";

export interface ReportAttentionItem {
  severity: ReportAttentionSeverity;
  title: string;
  evidence: string;
  action: string;
}

export interface ReportInsights {
  trendSummary: string[];
  attentionItems: ReportAttentionItem[];
  source: "ai" | "fallback";
}

export interface WeeklyReportData {
  startDate: string;
  endDate: string;
  generatedTime: string;
  storeCount: number;
  summary: DataSummary;
  totalSales: number;
  totalTarget: number;
  achievementRate: number;
  totalOrders: number;
  avgAOV: number;
  totalRefund: number;
  refundRate: number;
  totalCancel: number;
  totalPromo: number;
  promoRate: number;
  storeRanking: WeeklyReportStoreRank[];
  dateLabels: string[];
  salesTrend: number[];
  targetTrend: number[];
  orderTrend: number[];
  aovTrend: number[];
  channelSeries: Array<{
    name: string;
    type: "line";
    stack: string;
    areaStyle: Record<string, never>;
    smooth: boolean;
    data: number[];
  }>;
  channelBreakdown: WeeklyReportBreakdownItem[];
  daypartBreakdown: WeeklyReportBreakdownItem[];
  categoryBreakdown: WeeklyReportBreakdownItem[];
  refundReasons: Array<{ reason: string; amount: number; orders: number }>;
  weekendAvg: number;
  weekdayAvg: number;
  weekendVs: number;
  maxDay: string;
  maxDaySales: number;
  minDay: string;
  minDaySales: number;
  anomalies: string[];
  storeNames: string[];
  storeSales: number[];
  storeTargets: number[];
}
