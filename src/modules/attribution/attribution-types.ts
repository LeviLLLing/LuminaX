export interface AttributionData {
  dateRange: { start: string; end: string };
  storeIds: string[];
  storeNames: Record<string, string>;
  salesSummary: {
    totalSales: number;
    totalTarget: number;
    achievementRate: number;
    totalOrders: number;
    avgOrderValue: number;
  };
  dailyDetail: Array<{
    date: string;
    actualSales: number;
    salesTarget: number;
    achievementRate: number;
    orderCount: number;
    avgOrderValue: number;
  }>;
  orderVsAov: {
    avgDailySales: number;
    avgDailyOrders: number;
    avgAOV: number;
    actualDailySales: number;
    actualDailyOrders: number;
    salesDrop: number;
    ordersDrop: number;
    aovDrop: number;
    mainIssue: "orders" | "aov" | "both" | "none";
  };
  channelBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
  daypartBreakdown: Record<string, number>;
  channelDaily: Array<{
    date: string;
    channel: string;
    salesAmount: number;
    orderCount: number;
  }>;
  refundSummary: {
    totalRefund: number;
    totalCancelled: number;
    refundRate: number;
  };
  refundDaily: Array<{
    date: string;
    refundAmount: number;
    refundRate: number;
    cancelledOrders: number;
  }>;
  refundByStore: Array<{
    storeId: string;
    storeName: string;
    refundAmount: number;
    cancelledOrders: number;
    refundRate: number;
  }>;
  managerFeedback: Array<{
    date: string;
    store_id: string;
    feedback_type: string;
    feedback_detail: string;
    manager_name: string;
  }>;
  promotionSummary: {
    totalDiscount: number;
    totalPromoUnits: number;
    promoCount: number;
    topPromotions: Array<{
      promotion_name: string;
      promo_sales: number;
      promo_orders: number;
    }>;
  };

  // ---- AttributionData v2 扩展字段（只增不改，旧消费方保持兼容）----
  requestId?: string;
  benchmark?: {
    type: BenchmarkKind;
    label: string;
    window: { start: string; end: string } | null;
  };
  decomposition?: AttributionDecomposition;
  factorContributions?: AttributionFactorContribution[];
  feedbackSignals?: FeedbackSignal[];
}

export type BenchmarkKind =
  | "target"
  | "historical"
  | "last_week"
  | "same_weekday"
  | "peer_group";

export interface AttributionDecomposition {
  totalGap: number;
  orderVolumeGap: number;
  aovGap: number;
  interaction: number;
  dimensionContributions: AttributionDimensionContribution[];
}

export interface AttributionDimensionContribution {
  dimension: "channel" | "daypart" | "category";
  name: string;
  contribution: number;
  share: number;
}

export interface AttributionFactorContribution {
  factor: string;
  label: string;
  contribution: number;
  direction: "up" | "down" | "flat";
  benchmark: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

export interface FeedbackSignal {
  date: string;
  storeId: string;
  type: string;
  daypart: string;
  channel: string;
  direction: "negative" | "neutral" | "positive";
  controllable: boolean;
  claim: string;
  verified: boolean;
  confidence: "high" | "medium" | "low";
}
