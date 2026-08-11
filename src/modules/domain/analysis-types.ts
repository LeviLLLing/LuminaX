export interface Entities {
  storeIds: string[];
  startDate: string | null;
  endDate: string | null;
}

export type AnalysisIntent =
  | "achievement_rate"
  | "order_trend"
  | "aov_trend"
  | "channel_mix"
  | "daypart_analysis"
  | "promotion_contribution"
  | "refund_rate"
  | "anomaly_detection"
  | "report"
  | "compare"
  | "attribution"
  | "custom_metric"
  | "irrelevant";

export type Intent = AnalysisIntent;

export interface DataSummary {
  dateRange: { start: string; end: string };
  stores: string[];
  salesSummary: {
    totalSales: number;
    totalOrders: number;
    totalTarget: number;
    achievementRate: string;
    avgOrderValue: number;
  };
  channelBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
  daypartBreakdown: Record<string, number>;
  refundSummary: {
    totalRefund: number;
    totalCancelled: number;
  };
  managerFeedback: Array<{
    date: string;
    store_id: string;
    feedback_type: string;
    feedback_detail: string;
    manager_name: string;
    affected_daypart: string;
    affected_channel: string;
  }>;
}
