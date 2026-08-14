import type { AnalysisIntent } from "@/modules/domain/analysis-types";

export const TRIGGERING_INSIGHT_INTENTS = [
  "order_trend",
  "aov_trend",
  "channel_mix",
  "daypart_analysis",
  "promotion_contribution",
  "refund_rate",
  "anomaly_detection",
  "compare",
  "attribution",
] as const satisfies readonly AnalysisIntent[];

const triggeringInsightIntents: ReadonlySet<AnalysisIntent> = new Set(
  TRIGGERING_INSIGHT_INTENTS
);

export function shouldGenerateInsight(intent: AnalysisIntent): boolean {
  return triggeringInsightIntents.has(intent);
}
