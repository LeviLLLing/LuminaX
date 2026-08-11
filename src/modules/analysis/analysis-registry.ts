import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import { formatAchievementRate } from "@/modules/chat/answer-formatters/achievement";
import { formatAnomalyDetection } from "@/modules/chat/answer-formatters/anomaly";
import { formatAttribution } from "@/modules/chat/answer-formatters/attribution";
import { formatCompare } from "@/modules/chat/answer-formatters/compare";
import {
  formatChannelMix,
  formatDaypartAnalysis,
} from "@/modules/chat/answer-formatters/mix";
import { formatPromotionContribution } from "@/modules/chat/answer-formatters/promotion";
import { formatRefundRate } from "@/modules/chat/answer-formatters/refund";
import {
  formatAovTrend,
  formatOrderTrend,
} from "@/modules/chat/answer-formatters/trend";

export type RegisteredAnalysisIntent = Exclude<
  AnalysisIntent,
  "report" | "custom_metric" | "irrelevant"
>;

type AnalysisFormatter = (data: Record<string, unknown>) => string;

export interface AnalysisDefinition {
  id: RegisteredAnalysisIntent;
  format: AnalysisFormatter;
}

const ANALYSIS_DEFINITIONS: Record<
  RegisteredAnalysisIntent,
  AnalysisDefinition
> = {
  achievement_rate: define("achievement_rate", formatAchievementRate),
  order_trend: define("order_trend", formatOrderTrend),
  aov_trend: define("aov_trend", formatAovTrend),
  channel_mix: define("channel_mix", formatChannelMix),
  daypart_analysis: define("daypart_analysis", formatDaypartAnalysis),
  promotion_contribution: define(
    "promotion_contribution",
    formatPromotionContribution
  ),
  refund_rate: define("refund_rate", formatRefundRate),
  anomaly_detection: define("anomaly_detection", formatAnomalyDetection),
  compare: define("compare", formatCompare),
  attribution: define("attribution", formatAttribution),
};

export function formatRegisteredAnalysis(
  intent: AnalysisIntent,
  data: Record<string, unknown>
): string | null {
  const definition =
    ANALYSIS_DEFINITIONS[intent as RegisteredAnalysisIntent];
  return definition ? definition.format(data) : null;
}

export function listAnalysisDefinitions(): ReadonlyArray<
  Pick<AnalysisDefinition, "id">
> {
  return Object.values(ANALYSIS_DEFINITIONS).map(({ id }) => ({ id }));
}

function define(
  id: RegisteredAnalysisIntent,
  format: AnalysisFormatter
): AnalysisDefinition {
  return { id, format };
}
