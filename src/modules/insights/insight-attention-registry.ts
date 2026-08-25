import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import type { MetricInsightPolicy } from "@/modules/admin/metrics/metric-definition";
import { InsightValidationError } from "./insight-validator";
import type { InsightAttentionPlan } from "./insight-attention-plan";
import {
  performanceAttentionStrategies,
  type InsightAttentionStrategy,
} from "./insight-performance-strategies";
import { riskStructureAttentionStrategies } from "./insight-risk-structure-strategies";
import { summaryAttentionStrategies } from "./insight-summary-strategies";
import type { InsightSourceCatalog } from "./insight-source-catalog";

export type SystemInsightIntent = Exclude<AnalysisIntent, "irrelevant">;

export const insightAttentionStrategies = {
  achievement_rate: performanceAttentionStrategies.achievement_rate!,
  order_trend: performanceAttentionStrategies.order_trend!,
  aov_trend: performanceAttentionStrategies.aov_trend!,
  channel_mix: riskStructureAttentionStrategies.channel_mix!,
  daypart_analysis: riskStructureAttentionStrategies.daypart_analysis!,
  promotion_contribution: riskStructureAttentionStrategies.promotion_contribution!,
  refund_rate: riskStructureAttentionStrategies.refund_rate!,
  anomaly_detection: riskStructureAttentionStrategies.anomaly_detection!,
  report: summaryAttentionStrategies.report,
  compare: performanceAttentionStrategies.compare!,
  attribution: summaryAttentionStrategies.attribution,
  custom_metric: summaryAttentionStrategies.custom_metric,
} satisfies Record<SystemInsightIntent, InsightAttentionStrategy>;

export function buildInsightAttentionPlan(input: {
  intent: AnalysisIntent;
  catalog: InsightSourceCatalog;
  customPolicy?: MetricInsightPolicy | null;
}): InsightAttentionPlan {
  if (input.intent === "irrelevant") {
    throw new InsightValidationError("INSUFFICIENT_SOURCE_DATA");
  }
  return insightAttentionStrategies[input.intent].build(
    input.catalog,
    input.customPolicy ?? null
  );
}
