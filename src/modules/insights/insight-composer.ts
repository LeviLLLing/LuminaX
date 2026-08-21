import { INSIGHT_COMPOSER_SYSTEM_PROMPT } from "@/modules/agents/prompts/insight-composer-system-prompt";
import type { AgentModel } from "@/modules/agents/shared/agent-model";
import { extractJsonObject, serializePromptData } from "@/modules/agents/shared/prompt-utils";
import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import type {
  InsightDraft,
  InsightModelDraft,
  InsightOwnerRole,
  InsightScope,
  InsightVerificationCode,
} from "./insight-types";
import type {
  InsightActionContext,
  InsightAttentionPlan,
} from "./insight-attention-plan";
import type { InsightSourceCatalog } from "./insight-source-catalog";
import { InsightValidationError } from "./insight-validator";

export interface InsightComposer {
  compose(input: {
    question: string;
    intent: AnalysisIntent;
    scope: InsightScope;
    catalog: InsightSourceCatalog;
    plan: InsightAttentionPlan;
    attributionNarrative?: string | null;
  }): Promise<InsightDraft>;
}

const MAX_ACTION_CONTEXTS = 3;
const ownerRoles: readonly InsightOwnerRole[] = ["区域经理", "店长", "运营", "财务", "数据分析"];
const verificationTemplates = {
  staffing_capacity: {
    focus: "人员配置与业务承接能力",
    check: "排班配置与业务承接记录",
  },
  execution_cadence: {
    focus: "运营执行节奏与协同",
    check: "任务节奏与执行记录",
  },
  product_mix: {
    focus: "商品与品类结构",
    check: "商品组合与品类表现记录",
  },
  promotion_effect: {
    focus: "促销参与与活动效果",
    check: "活动参与与促销表现记录",
  },
  traffic_conversion: {
    focus: "客流承接与转化过程",
    check: "客流与转化环节记录",
  },
  inventory_availability: {
    focus: "库存可用性",
    check: "库存与缺货记录",
  },
  service_quality: {
    focus: "服务质量",
    check: "服务过程与客户反馈",
  },
  data_quality: {
    focus: "数据完整性与统计口径",
    check: "来源数据与统计口径",
  },
} satisfies Record<InsightVerificationCode, {
  focus: string;
  check: string;
}>;
const verificationCodes = Object.keys(verificationTemplates) as InsightVerificationCode[];

export function createInsightComposer({ model }: { model: AgentModel }): InsightComposer {
  return {
    async compose(input): Promise<InsightDraft> {
      const fallback = createGroundedInsightDraft(input.catalog, input.plan);
      const sources = new Map(input.catalog.findingSources.map((source) => [source.id, source]));
      const contexts = compositionContexts(input.catalog, input.plan);
      let response: string | null;

      try {
        response = await model.complete({
          systemPrompt: INSIGHT_COMPOSER_SYSTEM_PROMPT,
          messages: [{
            role: "user",
            content: serializePromptData({
              question: input.question,
              intent: input.intent,
              scope: input.scope,
              lockedFindings: input.plan.findings.map((finding) => ({
                sourceId: finding.sourceId,
                label: sources.get(finding.sourceId)?.label,
                severity: finding.severity,
                confidence: finding.confidence,
              })),
              actionContexts: contexts.map((context) => ({
                contextId: context.id,
                subjectLabel: context.subjectLabel,
                severity: context.severity,
                mode: context.mode,
                verificationMetricCode: context.verificationMetricCode,
                verificationMetricLabel:
                  input.catalog.verificationMetricLabels[context.verificationMetricCode],
              })),
              allowedOwnerRoles: ownerRoles,
              allowedVerificationCodes: verificationCodes.map((code) => ({
                code,
                meaning: verificationTemplates[code].focus,
              })),
              attributionNarrative: input.attributionNarrative || undefined,
            }),
          }],
          temperature: 0.1,
        });
      } catch {
        return fallback;
      }

      const parsed = response ? extractJsonObject(response) : null;
      if (!parsed) return fallback;
      try {
        return bindModelDraft(parsed, input.catalog, input.plan);
      } catch (error) {
        if (error instanceof InsightValidationError) return fallback;
        throw error;
      }
    },
  };
}

export function createGroundedInsightDraft(
  catalog: InsightSourceCatalog,
  plan: InsightAttentionPlan
): InsightDraft {
  const findings = lockedFindings(catalog, plan);
  const contexts = compositionContexts(catalog, plan);
  return {
    findings,
    verificationItems: contexts
      .filter((context) => context.mode !== "monitor")
      .map((context) => ({
        sourceId: context.sourceId,
        hypothesis: context.mode === "verify"
          ? "当前信号缺少业务基准，需进一步验证"
          : "可能存在执行偏差，需进一步验证",
        requiredCheck: context.mode === "verify"
          ? "补充业务基准并核查相关经营记录"
          : "核查对应指标的门店明细和业务记录",
      })),
    actions: contexts.map((context) => ({
      priority: priorityFor(context),
      title: fallbackActionTitle(context),
      ownerRole: fallbackOwnerRole(context),
      verificationMetricCode: context.verificationMetricCode,
    })),
  };
}

function bindModelDraft(
  value: Record<string, unknown>,
  catalog: InsightSourceCatalog,
  plan: InsightAttentionPlan
): InsightDraft {
  const modelDraft = parseModelDraft(value);
  const contexts = compositionContexts(catalog, plan);
  const contextById = new Map(contexts.map((context) => [context.id, context]));
  assertUniqueContextIds(modelDraft.verificationItems.map((item) => item.contextId));
  assertUniqueContextIds(modelDraft.actions.map((item) => item.contextId));
  if (modelDraft.verificationItems.length > MAX_ACTION_CONTEXTS) {
    throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  }
  if (modelDraft.actions.length < 1 || modelDraft.actions.length > contexts.length) {
    throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  }

  const verificationItems = modelDraft.verificationItems.map((item) => {
    const context = contextById.get(item.contextId);
    if (!context) throw new InsightValidationError("UNKNOWN_ACTION_CONTEXT");
    if (context.mode === "monitor") {
      throw new InsightValidationError("MONITOR_CONTEXT_VERIFICATION");
    }
    const template = verificationTemplates[item.verificationCode];
    return {
      sourceId: context.sourceId,
      hypothesis: `${context.subjectLabel}可能需要从${template.focus}角度进一步验证`,
      requiredCheck: `核查${context.subjectLabel}相关的${template.check}`,
    };
  });
  const actions = modelDraft.actions.map((item) => {
    const context = contextById.get(item.contextId);
    if (!context) throw new InsightValidationError("UNKNOWN_ACTION_CONTEXT");
    return {
      priority: priorityFor(context),
      title: actionTitle(context),
      ownerRole: item.ownerRole,
      verificationMetricCode: context.verificationMetricCode,
    };
  });
  const actionContextIds = new Set(modelDraft.actions.map((item) => item.contextId));
  if (contexts.some((context) => context.severity === "high" && !actionContextIds.has(context.id))) {
    throw new InsightValidationError("MISSING_HIGH_RISK_ACTION");
  }

  return {
    findings: lockedFindings(catalog, plan),
    verificationItems,
    actions,
  };
}

function parseModelDraft(value: Record<string, unknown>): InsightModelDraft {
  assertExactKeys(value, ["verificationItems", "actions"]);
  return {
    verificationItems: array(value.verificationItems).map((item) => {
      assertExactKeys(item, ["contextId", "verificationCode"]);
      return {
        contextId: stringField(item, "contextId"),
        verificationCode: enumField(item, "verificationCode", verificationCodes),
      };
    }),
    actions: array(value.actions).map((item) => {
      assertExactKeys(item, ["contextId", "ownerRole"]);
      return {
        contextId: stringField(item, "contextId"),
        ownerRole: enumField(item, "ownerRole", ownerRoles),
      };
    }),
  };
}

function lockedFindings(
  catalog: InsightSourceCatalog,
  plan: InsightAttentionPlan
): InsightDraft["findings"] {
  if (plan.findings.length < 1 || plan.findings.length > 5) {
    throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  }
  const sourceIds = new Set(catalog.findingSources.map((source) => source.id));
  if (plan.findings.some((finding) => !sourceIds.has(finding.sourceId))) {
    throw new InsightValidationError("UNKNOWN_SOURCE_ID");
  }
  return plan.findings.map((finding) => ({
    ...finding,
    evidenceIds: [...finding.evidenceIds],
  }));
}

function compositionContexts(
  catalog: InsightSourceCatalog,
  plan: InsightAttentionPlan
): InsightActionContext[] {
  const contexts = plan.actionContexts.slice(0, MAX_ACTION_CONTEXTS);
  if (contexts.length < 1 || new Set(contexts.map((context) => context.id)).size !== contexts.length) {
    throw new InsightValidationError("INVALID_ACTION_CONTEXT");
  }
  const findingSourceIds = new Set(plan.findings.map((finding) => finding.sourceId));
  const catalogSourceIds = new Set(catalog.findingSources.map((source) => source.id));
  for (const context of contexts) {
    if (
      !findingSourceIds.has(context.sourceId) ||
      !catalogSourceIds.has(context.sourceId) ||
      !catalog.verificationMetricLabels[context.verificationMetricCode]
    ) {
      throw new InsightValidationError("INVALID_ACTION_CONTEXT");
    }
  }
  return contexts.map((context) => ({ ...context }));
}

function priorityFor(context: InsightActionContext): "P0" | "P1" | "P2" {
  if (context.severity === "high") return "P0";
  if (context.severity === "medium") return "P1";
  return "P2";
}

function fallbackActionTitle(context: InsightActionContext): string {
  if (context.mode === "monitor") return "持续跟踪关键经营指标";
  if (context.mode === "verify") return "补充判断基准并核查经营记录";
  return context.severity === "high"
    ? "核查重点经营执行与明细"
    : "复盘相关运营执行";
}

function fallbackOwnerRole(context: InsightActionContext): InsightOwnerRole {
  if (context.severity === "high") return "区域经理";
  if (context.mode === "verify") return "数据分析";
  if (context.mode === "monitor") return "运营";
  return "店长";
}

function assertUniqueContextIds(ids: string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new InsightValidationError("DUPLICATE_ACTION_CONTEXT");
  }
}

function actionTitle(context: InsightActionContext): string {
  if (context.mode === "monitor") return `持续跟踪${context.subjectLabel}`;
  if (context.mode === "verify") return `核查${context.subjectLabel}并补充判断基准`;
  return `核查并推进${context.subjectLabel}改善`;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  }
}

function array(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || !value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))) {
    throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  }
  return value as Record<string, unknown>[];
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (!isString(field)) throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  return field;
}

function enumField<T extends string>(
  value: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): T {
  const field = value[key];
  if (!isString(field) || !allowed.includes(field as T)) {
    throw new InsightValidationError("INVALID_MODEL_OUTPUT");
  }
  return field as T;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
