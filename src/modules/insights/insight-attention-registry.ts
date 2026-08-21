import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import { InsightValidationError } from "./insight-validator";
import type { InsightAttentionPlan } from "./insight-attention-plan";
import {
  performanceAttentionStrategies,
  type InsightAttentionStrategy,
} from "./insight-performance-strategies";
import type { InsightSourceCatalog } from "./insight-source-catalog";

export const insightAttentionStrategies: Partial<
  Record<AnalysisIntent, InsightAttentionStrategy>
> = { ...performanceAttentionStrategies };

export function buildInsightAttentionPlan(input: {
  intent: AnalysisIntent;
  catalog: InsightSourceCatalog;
  customPolicy?: unknown;
}): InsightAttentionPlan {
  const strategy = insightAttentionStrategies[input.intent];
  if (!strategy) {
    throw new InsightValidationError("UNSUPPORTED_INTENT", input.intent);
  }
  return strategy.build(input.catalog);
}
