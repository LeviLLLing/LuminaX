import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import type { ViewMode } from "@/modules/domain/ui-types";

export interface IntentViewMetadata {
  intent: AnalysisIntent;
  storeIds: string[];
  startDate: string;
  endDate: string;
}

const DASHBOARD_INTENTS: AnalysisIntent[] = [
  "compare",
  "attribution",
  "order_trend",
  "aov_trend",
  "channel_mix",
  "daypart_analysis",
  "anomaly_detection",
];

const INTENT_MODE_LABELS: Partial<Record<AnalysisIntent, string>> = {
  report: "周报视图",
  compare: "门店对比",
  attribution: "归因分析",
  custom_metric: "自定义指标",
  achievement_rate: "销售达成率",
  order_trend: "订单趋势",
  aov_trend: "客单价趋势",
  channel_mix: "渠道占比",
  daypart_analysis: "分时段",
  promotion_contribution: "促销贡献",
  refund_rate: "退款率",
  anomaly_detection: "异常检测",
};

export function resolveIntentView(intent: AnalysisIntent): ViewMode {
  if (intent === "report") return "report";
  if (DASHBOARD_INTENTS.includes(intent)) return "dashboard";
  return "chat";
}

export function getIntentModeLabel(intent: AnalysisIntent): string {
  return INTENT_MODE_LABELS[intent] || "数据分析";
}

export function shouldAppendModeActivation(intent: AnalysisIntent): boolean {
  return intent !== "irrelevant";
}
