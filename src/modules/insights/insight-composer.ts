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
      if (!parsed) return createGroundedInsightDraft(input.catalog);
      try {
        return parseDraft(parsed);
      } catch (error) {
        if (error instanceof InsightValidationError) {
          return createGroundedInsightDraft(input.catalog);
        }
        throw error;
      }
    },
  };
}

export function createGroundedInsightDraft(
  catalog: InsightSourceCatalog
): InsightDraft {
  const sources = catalog.findingSources.slice(0, 3);
  if (sources.length === 0 || sources.some((source) => !source.evidenceCandidateIds[0])) {
    throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  }
  return {
    findings: sources.map((source, index) => ({
      sourceId: source.id,
      severity:
        sources.length === 1 ? "positive" : index === 0 ? "high" : "medium",
      confidence: "needs_verification",
      evidenceIds: [source.evidenceCandidateIds[0]],
    })),
    verificationItems: sources.slice(0, 2).map((source) => ({
      sourceId: source.id,
      hypothesis: "可能存在执行偏差，需进一步验证",
      requiredCheck: "核查对应指标的门店明细和业务记录",
    })),
    actions: sources.slice(0, 2).map((source, index) => ({
      priority: index === 0 ? "P0" : "P1",
      title:
        sources.length === 1
          ? "持续跟踪关键经营指标"
          : index === 0
            ? "核查关键经营执行与明细"
            : "复盘相关运营动作",
      ownerRole: index === 0 ? "区域经理" : "运营",
      verificationMetricCode: source.metricCode,
    })),
  };
}

function parseDraft(value: Record<string, unknown>): InsightDraft {
  const findings = array(value.findings);
  const verificationItems = array(value.verificationItems);
  const actions = array(value.actions);
  if (findings.length < 3 || findings.length > 5 || verificationItems.length > 3 || actions.length < 2 || actions.length > 5) {
    throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  }
  return {
    findings: findings.map((item) => {
      const sourceId = stringField(item, "sourceId");
      const severity = enumField(item, "severity", severities);
      const confidence = enumField(item, "confidence", confidences);
      const evidenceIds = stringArray(item.evidenceIds);
      return { sourceId, severity, confidence, evidenceIds };
    }),
    verificationItems: verificationItems.map((item) => ({
      sourceId: stringField(item, "sourceId"),
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
