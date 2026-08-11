import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import type {
  WorkbenchContext,
  WorkbenchIntent,
  WorkbenchTemplateId,
} from "./workbench-types";

export type InsightView = "overview" | "analysis" | "report";
export type InsightSectionId =
  | "totalSales"
  | "achievement"
  | "orders"
  | "aov"
  | "salesTrend"
  | "channel"
  | "category"
  | "daypart"
  | "refund";

const SECTION_ORDER: readonly InsightSectionId[] = [
  "totalSales",
  "achievement",
  "orders",
  "aov",
  "salesTrend",
  "channel",
  "category",
  "daypart",
  "refund",
];

const METRIC_SECTIONS: Readonly<Record<string, readonly InsightSectionId[]>> = {
  achievement_rate: ["totalSales", "achievement", "salesTrend"],
  order_trend: ["orders", "salesTrend"],
  aov_trend: ["totalSales", "aov", "salesTrend"],
  channel_mix: ["channel"],
  daypart_analysis: ["daypart"],
  promotion_contribution: ["totalSales", "salesTrend"],
  refund_rate: ["totalSales", "refund"],
  anomaly_detection: ["totalSales", "orders", "aov", "salesTrend", "refund"],
  compare: SECTION_ORDER,
  attribution: SECTION_ORDER,
  report: SECTION_ORDER,
};

export function getVisibleInsightSections(
  metricCodes: readonly string[]
): InsightSectionId[] {
  const visible = new Set(
    metricCodes.flatMap((metricCode) => METRIC_SECTIONS[metricCode] ?? [])
  );
  return SECTION_ORDER.filter((section) => visible.has(section));
}

export function resolveInsightView(intent: AnalysisIntent): InsightView {
  if (intent === "report") return "report";
  if (intent === "irrelevant") return "overview";
  return "analysis";
}

export function getWorkbenchCopy(templateId: WorkbenchTemplateId) {
  return templateId === "regional_manager"
    ? { label: "区域经理模板", title: "辖区经营概览" }
    : { label: "通用模板", title: "经营决策工作台" };
}

const INTENT_PROMPTS: Record<WorkbenchIntent, string> = {
  achievement_rate: "分析当前范围的销售达成率",
  order_trend: "分析当前范围的订单趋势",
  aov_trend: "分析当前范围的客单价趋势",
  channel_mix: "分析当前范围的渠道结构",
  daypart_analysis: "分析当前范围的分时段表现",
  promotion_contribution: "分析促销活动的销售贡献",
  refund_rate: "分析退款率和主要风险",
  anomaly_detection: "识别当前范围的经营异常",
  compare: "对比当前范围内的门店表现",
  attribution: "归因分析当前经营表现",
  report: "生成当前范围的经营周报",
  custom_metric: "分析可用的自定义指标",
};

export function getSuggestedQuestions(context: WorkbenchContext): string[] {
  return context.availableIntents
    .map((intent) => INTENT_PROMPTS[intent])
    .slice(0, 3);
}

const METRIC_LABELS: Readonly<Record<string, string>> = {
  achievement_rate: "销售达成率",
  order_trend: "订单趋势",
  aov_trend: "客单价趋势",
  channel_mix: "渠道结构",
  daypart_analysis: "时段表现",
  promotion_contribution: "促销贡献",
  refund_rate: "退款率",
  anomaly_detection: "异常检测",
  compare: "门店对比",
  attribution: "经营归因",
  report: "经营周报",
};

export function getMetricLabel(metricCode: string): string {
  return METRIC_LABELS[metricCode] ?? metricCode;
}
