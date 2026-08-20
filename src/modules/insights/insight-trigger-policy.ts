import type { AnalysisIntent } from "@/modules/domain/analysis-types";

export const TRIGGERING_INSIGHT_INTENTS = [
  "achievement_rate",
  "order_trend",
  "aov_trend",
  "channel_mix",
  "daypart_analysis",
  "promotion_contribution",
  "refund_rate",
  "anomaly_detection",
  "report",
  "compare",
  "attribution",
  "custom_metric",
] as const satisfies readonly AnalysisIntent[];

const triggeringInsightIntents: ReadonlySet<AnalysisIntent> = new Set(
  TRIGGERING_INSIGHT_INTENTS
);

export function shouldGenerateInsight(intent: AnalysisIntent): boolean {
  return triggeringInsightIntents.has(intent);
}
