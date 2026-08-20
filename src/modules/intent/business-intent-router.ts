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

export interface BusinessIntentRouteResult {
  intent: SystemAnalysisIntent;
  confidence: number;
  source: "model" | "fallback";
  fallbackReason:
    | "timeout"
    | "empty"
    | "invalid_json"
    | "invalid_intent"
    | "low_confidence"
    | null;
  durationMs: number;
  disagreesWithFallback: boolean;
}

export interface BusinessIntentRouteEvent {
  intent: SystemAnalysisIntent;
  source: BusinessIntentRouteResult["source"];
  confidenceBand: "low" | "medium" | "high";
  durationMs: number;
  fallbackReason: BusinessIntentRouteResult["fallbackReason"];
  disagreesWithFallback: boolean;
}

export interface BusinessIntentRouter {
  route(input: BusinessIntentRouteInput): Promise<BusinessIntentRouteResult>;
}

export interface CreateBusinessIntentRouterOptions {
  model: AgentModel;
  fallback?: typeof classifyIntent;
  now?: () => number;
  onRoute?: (event: BusinessIntentRouteEvent) => void;
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
      const fallbackIntent = toSystemIntent(
        fallback(input.question, { scopeHint: input.scopeHint }).intent
      );

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
  };
}

function observeRoute(
  onRoute: CreateBusinessIntentRouterOptions["onRoute"],
  result: BusinessIntentRouteResult
): BusinessIntentRouteResult {
  try {
    onRoute?.({
      intent: result.intent,
      source: result.source,
      confidenceBand: confidenceBand(result.confidence),
      durationMs: result.durationMs,
      fallbackReason: result.fallbackReason,
      disagreesWithFallback: result.disagreesWithFallback,
    });
  } catch {
    // Route telemetry must not affect the business request.
  }
  return result;
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
): Exclude<BusinessIntentRouteResult["fallbackReason"], "timeout" | null> {
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
  fallbackReason: Exclude<BusinessIntentRouteResult["fallbackReason"], null>,
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

function toSystemIntent(intent: AnalysisIntent): SystemAnalysisIntent {
  return ALLOWED_INTENTS.has(intent as SystemAnalysisIntent)
    ? (intent as SystemAnalysisIntent)
    : "achievement_rate";
}
