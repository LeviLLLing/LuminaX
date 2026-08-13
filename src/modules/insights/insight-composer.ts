import type { AgentModel } from "@/modules/agents/shared/agent-model";
import { extractJsonObject, serializePromptData } from "@/modules/agents/shared/prompt-utils";
import { INSIGHT_COMPOSER_SYSTEM_PROMPT } from "@/modules/agents/prompts/insight-composer-system-prompt";
import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import type {
  InsightConfidence,
  InsightDraft,
  InsightOwnerRole,
  InsightScope,
  InsightSeverity,
} from "./insight-types";
import type { InsightSourceCatalog } from "./insight-source-catalog";
import { InsightValidationError } from "./insight-validator";

export interface InsightComposer {
  compose(input: {
    question: string;
    intent: AnalysisIntent;
    scope: InsightScope;
    catalog: InsightSourceCatalog;
    attributionNarrative?: string | null;
  }): Promise<InsightDraft>;
}

const severities: readonly InsightSeverity[] = ["high", "medium", "low", "positive"];
const confidences: readonly InsightConfidence[] = ["high", "medium", "needs_verification"];
const priorities = ["P0", "P1", "P2"] as const;
const ownerRoles: readonly InsightOwnerRole[] = ["区域经理", "店长", "运营", "财务", "数据分析"];

export function createInsightComposer({ model }: { model: AgentModel }): InsightComposer {
  return {
    async compose(input): Promise<InsightDraft> {
      const response = await model.complete({
        systemPrompt: INSIGHT_COMPOSER_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: serializePromptData({
            question: input.question,
            intent: input.intent,
            scope: input.scope,
            findingSources: input.catalog.findingSources.map((source) => ({
              id: source.id,
              label: source.label,
              evidenceCandidateIds: source.evidenceCandidateIds,
            })),
            evidenceCandidates: input.catalog.evidenceCandidates.map((candidate) => ({ id: candidate.id, type: candidate.type, title: candidate.title })),
            verificationMetricLabels: input.catalog.verificationMetricLabels,
            ownerRoles,
            attributionNarrative: input.attributionNarrative || undefined,
          }),
        }],
        temperature: 0.1,
      });
      const parsed = response ? extractJsonObject(response) : null;
      if (!parsed) throw new InsightValidationError("INVALID_MODEL_OUTPUT");
      return parseDraft(parsed);
    },
  };
}

function parseDraft(value: Record<string, unknown>): InsightDraft {
  const findings = array(value.findings);
  const verificationItems = array(value.verificationItems);
  const actions = array(value.actions);
  if (!isString(value.headline) || findings.length < 3 || findings.length > 5 || verificationItems.length > 3 || actions.length < 2 || actions.length > 5) {
    throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  }
  return {
    headline: value.headline,
    findings: findings.map((item) => {
      const sourceId = stringField(item, "sourceId");
      const title = stringField(item, "title");
      const summary = stringField(item, "summary");
      const severity = enumField(item, "severity", severities);
      const confidence = enumField(item, "confidence", confidences);
      const evidenceIds = stringArray(item.evidenceIds);
      return { sourceId, title, summary, severity, confidence, evidenceIds };
    }),
    verificationItems: verificationItems.map((item) => ({
      observedFact: stringField(item, "observedFact"),
      hypothesis: stringField(item, "hypothesis"),
      requiredCheck: stringField(item, "requiredCheck"),
    })),
    actions: actions.map((item) => ({
      priority: enumField(item, "priority", priorities),
      title: stringField(item, "title"),
      ownerRole: enumField(item, "ownerRole", ownerRoles),
      verificationMetricCode: stringField(item, "verificationMetricCode"),
    })),
  };
}

function array(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  return value as Record<string, unknown>[];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(isString)) throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  return value;
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (!isString(field)) throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  return field;
}

function enumField<T extends string>(value: Record<string, unknown>, key: string, allowed: readonly T[]): T {
  const field = value[key];
  if (!isString(field) || !allowed.includes(field as T)) throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  return field as T;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
