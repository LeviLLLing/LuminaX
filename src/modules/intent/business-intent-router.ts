import { BUSINESS_INTENT_ROUTER_SYSTEM_PROMPT } from "@/modules/agents/prompts/business-intent-router-system-prompt";
import type { AgentModel } from "@/modules/agents/shared/agent-model";
import {
  extractJsonObject,
  serializePromptData,
} from "@/modules/agents/shared/prompt-utils";
import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import {
  classifyIntent,
  type IntentScopeHint,
} from "@/modules/intent/intent-classifier";

export type SystemAnalysisIntent = Exclude<
  AnalysisIntent,
  "irrelevant" | "custom_metric"
>;

export interface BusinessIntentRouteInput {
  question: string;
  scopeHint: IntentScopeHint;
  previousUserQuestion: string | null;
}

export type BusinessIntentRouteFallbackReason =
  | "timeout"
  | "empty"
  | "invalid_json"
  | "invalid_intent"
  | "low_confidence"
  | "current_question_explicit"
  | "custom_metric_ambiguous";

export interface BusinessIntentRouteResult {
  intent: SystemAnalysisIntent;
  confidence: number;
  source: "model" | "fallback";
  fallbackReason: BusinessIntentRouteFallbackReason | null;
  durationMs: number;
  disagreesWithFallback: boolean;
}

export interface BusinessIntentRouteEvent {
  intent: AnalysisIntent;
  source:
    | BusinessIntentRouteResult["source"]
    | "custom_metric"
    | "custom_metric_ambiguous";
  confidenceBand: "low" | "medium" | "high";
  durationMs: number;
  fallbackReason: BusinessIntentRouteFallbackReason | null;
  disagreesWithFallback: boolean;
}

export interface BusinessIntentRouter {
  route(input: BusinessIntentRouteInput): Promise<BusinessIntentRouteResult>;
  observe?(event: BusinessIntentRouteEvent): void;
}

export interface CreateBusinessIntentRouterOptions {
  model: AgentModel;
  fallback?: typeof classifyIntent;
  now?: () => number;
  onRoute?: (event: BusinessIntentRouteEvent) => unknown;
}

const ALLOWED_INTENTS = new Set<SystemAnalysisIntent>([
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
]);

const MIN_CONFIDENCE = 0.7;
const FALLBACK_CONFIDENCE = 0.7;

export function createBusinessIntentRouter({
  model,
  fallback = classifyIntent,
  now = Date.now,
  onRoute,
}: CreateBusinessIntentRouterOptions): BusinessIntentRouter {
  return {
    async route(input) {
      const startedAt = now();
      const deterministic = fallback(input.question, { scopeHint: input.scopeHint });
      const fallbackIntent = toSystemIntent(deterministic.intent);

      if (
        isExplicitCurrentIntent(
          input.question,
          deterministic.intent,
          deterministic.relevant
        )
      ) {
        return observeRoute(
          onRoute,
          fallbackResult(
            fallbackIntent,
            "current_question_explicit",
            now() - startedAt
          )
        );
      }

      try {
        const response = await model.complete({
          systemPrompt: BUSINESS_INTENT_ROUTER_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: serializePromptData({
                question: input.question,
                scopeHint: input.scopeHint,
                previousUserQuestion: input.previousUserQuestion,
              }),
            },
          ],
          temperature: 0,
        });
        const parsed = parseModelRoute(response);

        if (!parsed) {
          const fallbackReason = getFallbackReason(response);
          return observeRoute(
            onRoute,
            fallbackResult(fallbackIntent, fallbackReason, now() - startedAt)
          );
        }

        return observeRoute(onRoute, {
          intent: parsed.intent,
          confidence: parsed.confidence,
          source: "model",
          fallbackReason: null,
          durationMs: now() - startedAt,
          disagreesWithFallback: parsed.intent !== fallbackIntent,
        });
      } catch {
        return observeRoute(
          onRoute,
          fallbackResult(fallbackIntent, "timeout", now() - startedAt)
        );
      }
    },
    observe(event) {
      observeEvent(onRoute, event);
    },
  };
}

function observeRoute(
  onRoute: CreateBusinessIntentRouterOptions["onRoute"],
  result: BusinessIntentRouteResult
): BusinessIntentRouteResult {
  observeEvent(onRoute, {
    intent: result.intent,
    source: result.source,
    confidenceBand: confidenceBand(result.confidence),
    durationMs: result.durationMs,
    fallbackReason: result.fallbackReason,
    disagreesWithFallback: result.disagreesWithFallback,
  });
  return result;
}

function observeEvent(
  onRoute: CreateBusinessIntentRouterOptions["onRoute"],
  event: BusinessIntentRouteEvent
): void {
  try {
    const observation = onRoute?.(event);
    void Promise.resolve(observation).catch(() => {});
  } catch {
    // Route telemetry must not affect the business request.
  }
}

function confidenceBand(confidence: number): BusinessIntentRouteEvent["confidenceBand"] {
  if (confidence < 0.8) return "low";
  if (confidence < 0.9) return "medium";
  return "high";
}

function parseModelRoute(
  response: string | null
): { intent: SystemAnalysisIntent; confidence: number } | null {
  if (!response) return null;

  const parsed = extractJsonObject(response);
  if (!parsed || !hasExactRouteFields(parsed)) return null;

  const { intent, confidence } = parsed;
  if (
    typeof intent !== "string" ||
    !ALLOWED_INTENTS.has(intent as SystemAnalysisIntent) ||
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < MIN_CONFIDENCE ||
    confidence > 1
  ) {
    return null;
  }

  return { intent: intent as SystemAnalysisIntent, confidence };
}

function hasExactRouteFields(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === 2 &&
    keys.includes("intent") &&
    keys.includes("confidence")
  );
}

function getFallbackReason(
  response: string | null
): Exclude<BusinessIntentRouteFallbackReason, "timeout" | "current_question_explicit" | "custom_metric_ambiguous"> {
  if (!response) return "empty";

  const parsed = extractJsonObject(response);
  if (!parsed) return "invalid_json";
  if (typeof parsed.confidence === "number" && parsed.confidence < MIN_CONFIDENCE) {
    return "low_confidence";
  }
  return "invalid_intent";
}

function fallbackResult(
  intent: SystemAnalysisIntent,
  fallbackReason: BusinessIntentRouteFallbackReason,
  durationMs: number
): BusinessIntentRouteResult {
  return {
    intent,
    confidence: FALLBACK_CONFIDENCE,
    source: "fallback",
    fallbackReason,
    durationMs,
    disagreesWithFallback: false,
  };
}

function isExplicitCurrentIntent(
  question: string,
  intent: AnalysisIntent,
  relevant: boolean
): boolean {
  if (!relevant) return false;

  const explicitMarkers: Record<SystemAnalysisIntent, RegExp> = {
    achievement_rate: /目标|达成|完成/,
    order_trend: /订单.*(?:趋势|变化|走势)/,
    aov_trend: /客单价|aov/i,
    channel_mix: /渠道|占比/,
    daypart_analysis: /时段|早餐|午餐|下午茶|晚餐/,
    promotion_contribution: /促销|优惠/,
    refund_rate: /退款|取消/,
    anomaly_detection: /异常|波动/,
    report: /周报|报告/,
    compare: /对比|比较|\bvs\b/i,
    attribution: /为什么|归因|原因/,
  };
  return (
    intent !== "irrelevant" &&
    intent !== "custom_metric" &&
    explicitMarkers[intent].test(question)
  );
}

function toSystemIntent(intent: AnalysisIntent): SystemAnalysisIntent {
  return ALLOWED_INTENTS.has(intent as SystemAnalysisIntent)
    ? (intent as SystemAnalysisIntent)
    : "achievement_rate";
}
