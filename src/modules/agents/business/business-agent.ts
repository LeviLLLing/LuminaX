import type { AttributionAgent } from "@/modules/agents/attribution/attribution-agent";
import type { CustomMetricRuntime } from "@/modules/admin/metrics/custom-metric-runtime";
import {
  DataAccessDeniedError,
  allowAllAccessControl,
  type AccessControl,
} from "@/modules/admin/permissions/access-control";
import {
  FIXED_METRIC_ACCESS_REQUIREMENTS,
  getCustomMetricAccessRequirements,
} from "@/modules/admin/permissions/metric-access-requirements";
import { BUSINESS_SYSTEM_PROMPT } from "@/modules/agents/prompts/business-system-prompt";
import type { AgentMemory } from "@/modules/agents/shared/agent-memory";
import type { AgentModel } from "@/modules/agents/shared/agent-model";
import { serializePromptData } from "@/modules/agents/shared/prompt-utils";
import type { GovernanceHandoff } from "@/modules/agents/governance/governance-agent";
import {
  buildGuideMessage,
  buildOutOfScopeMessage,
  formatLocalAnalysis,
} from "@/modules/chat/local-answer-formatter";
import { formatCustomMetric } from "@/modules/chat/answer-formatters/custom-metric";
import {
  DEFAULT_END_DATE,
  DEFAULT_START_DATE,
} from "@/modules/domain/constants";
import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import type { DataAccessRequirement } from "@/modules/admin/permissions/permission-types";
import {
  classifyIntent,
  extractDateRange,
  extractStoreIds,
  type IntentResult,
} from "@/modules/intent/intent-classifier";
import type {
  SqlMetricIntent,
  SqlMetricQueryExecutor,
} from "@/modules/metrics/sql-metric-query-executor";
import {
  NOOP_CHAT_STREAM,
  type ChatStreamCallbacks,
} from "@/modules/chat/chat-stream";

export interface BusinessAgentRequest extends GovernanceHandoff {
  userId?: string;
  storeIds?: string[];
  startDate?: string;
  endDate?: string;
  stream?: ChatStreamCallbacks;
  onAnalysisPlanned?: (intent: AnalysisIntent) => void | Promise<void>;
  onAnalysisReady?: (
    analysis: BusinessAnalysisContext
  ) => Promise<BusinessResponseOverride | null>;
}

export interface BusinessAnalysisContext {
  question: string;
  intent: AnalysisIntent;
  analysisData: Record<string, unknown>;
  attributionNarrative: string | null;
  fallbackContent: string;
  storeIds: string[];
  startDate: string;
  endDate: string;
  accessRequirements: DataAccessRequirement[];
}

export interface BusinessResponseOverride {
  content: string;
}

export interface BusinessAgentResult {
  intentResult: IntentResult;
  content: string;
  storeIds: string[];
  startDate: string;
  endDate: string;
}

export interface BusinessAgent {
  execute(request: BusinessAgentRequest): Promise<BusinessAgentResult>;
}

export interface BusinessAgentDependencies {
  metricQueryExecutor: SqlMetricQueryExecutor;
  model: AgentModel;
  memory: AgentMemory;
  attributionAgent: AttributionAgent;
  customMetricRuntime?: CustomMetricRuntime;
  accessControl?: AccessControl;
}

export class BusinessAgentError extends Error {
  constructor(
    public readonly code: "DATA_NOT_LOADED" | "ACCESS_DENIED",
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "BusinessAgentError";
  }
}

export function createBusinessAgent({
  metricQueryExecutor,
  model,
  memory,
  attributionAgent,
  customMetricRuntime,
  accessControl = allowAllAccessControl,
}: BusinessAgentDependencies): BusinessAgent {
  return {
    async execute(request) {
      const classifiedIntent = classifyIntent(request.question);
      const customMetric =
        customMetricRuntime && !classifiedIntent.outOfScope
          ? await customMetricRuntime.match(request.question)
          : null;
      const customDateRange = extractDateRange(request.question);
      const intentResult: IntentResult = customMetric
        ? {
            intent: "custom_metric",
            storeIds: extractStoreIds(request.question),
            startDate: customDateRange.start,
            endDate: customDateRange.end,
            relevant: true,
            outOfScope: false,
          }
        : classifiedIntent;
      const startDate =
        intentResult.startDate || request.startDate || DEFAULT_START_DATE;
      const endDate =
        intentResult.endDate || request.endDate || DEFAULT_END_DATE;

      if (intentResult.outOfScope) {
        return createResult(
          intentResult,
          buildOutOfScopeMessage(),
          [],
          startDate,
          endDate
        );
      }

      if (intentResult.intent === "irrelevant" || !intentResult.relevant) {
        return createResult(
          intentResult,
          buildGuideMessage(),
          [],
          startDate,
          endDate
        );
      }

      if (customMetric && customMetricRuntime) {
        try {
          const allStoreIds = await metricQueryExecutor.listStoreIds();
          const requestedStoreIds = resolveStoreIds(
            intentResult.storeIds,
            request.storeIds,
            allStoreIds
          );
          const { storeIds } = await accessControl.authorizeScope({
            userId: request.userId || "system-admin",
            requirements: getCustomMetricAccessRequirements(customMetric),
            requestedStoreIds,
            availableStoreIds: allStoreIds,
            strictStoreScope:
              intentResult.storeIds.length > 0 ||
              Boolean(request.storeIds?.length),
          });
          const scope = { storeIds, startDate, endDate };
          const execution = await customMetricRuntime.execute(
            customMetric.id,
            scope
          );
          const analysisData = execution as unknown as Record<string, unknown>;
          const fallbackContent = formatCustomMetric(execution, scope);
          const content = await generateBusinessAnswer({
            model,
            memory,
            sessionId: request.sessionId,
            question: request.question,
            intent: `custom_metric:${customMetric.code}`,
            analysisData,
            fallbackContent,
            stream: request.stream,
          });
          return createResult(intentResult, content, storeIds, startDate, endDate);
        } catch (error) {
          if (error instanceof DataAccessDeniedError) {
            throw new BusinessAgentError("ACCESS_DENIED", error.message, {
              cause: error,
            });
          }
          throw new BusinessAgentError("DATA_NOT_LOADED", "Data not loaded", {
            cause: error,
          });
        }
      }

      const metricIntent = toSqlMetricIntent(intentResult.intent);
      if (!metricIntent) {
        return createResult(
          intentResult,
          buildGuideMessage(),
          [],
          startDate,
          endDate
        );
      }

      await request.onAnalysisPlanned?.(intentResult.intent);

      let allStoreIds: string[];
      let analysisData: Record<string, unknown> | null;
      let storeIds: string[];
      try {
        allStoreIds = await metricQueryExecutor.listStoreIds();
        const requestedStoreIds = resolveStoreIds(
          intentResult.storeIds,
          request.storeIds,
          allStoreIds
        );
        ({ storeIds } = await accessControl.authorizeScope({
          userId: request.userId || "system-admin",
          requirements: FIXED_METRIC_ACCESS_REQUIREMENTS[metricIntent],
          requestedStoreIds,
          availableStoreIds: allStoreIds,
          strictStoreScope:
            intentResult.storeIds.length > 0 || Boolean(request.storeIds?.length),
        }));
        const execution = await metricQueryExecutor.execute(metricIntent, {
          storeIds,
          startDate,
          endDate,
        });
        analysisData = execution.data;
      } catch (error) {
        if (error instanceof DataAccessDeniedError) {
          throw new BusinessAgentError("ACCESS_DENIED", error.message, {
            cause: error,
          });
        }
        throw new BusinessAgentError("DATA_NOT_LOADED", "Data not loaded", {
          cause: error,
        });
      }

      // 归因问题：当范围含多家门店时，追加门店对比快照，
      // 让归因 Agent 能回答"为什么 A 低于/高于 B"这类跨门店问题
      const attributionData =
        intentResult.intent === "attribution" && analysisData
          ? await enrichAttributionWithComparison(
              metricQueryExecutor,
              storeIds,
              startDate,
              endDate,
              analysisData
            )
          : analysisData;

      const fallbackContent = formatLocalAnalysis(
        metricIntent,
        attributionData
      );

      const attributionNarrative =
        intentResult.intent === "attribution" && attributionData
          ? await attributionAgent.analyze({
              sessionId: request.sessionId,
              question: request.question,
              analysisData: attributionData,
              fallbackContent,
              stream: request.onAnalysisReady ? NOOP_CHAT_STREAM : request.stream,
            })
          : null;

      if (request.onAnalysisReady && attributionData) {
        const override = await request.onAnalysisReady({
          question: request.question,
          intent: intentResult.intent,
          analysisData: attributionData,
          attributionNarrative,
          fallbackContent,
          storeIds: [...storeIds],
          startDate,
          endDate,
          accessRequirements: structuredClone(
            FIXED_METRIC_ACCESS_REQUIREMENTS[metricIntent]
          ),
        });
        if (override) {
          memory.remember(
            request.sessionId,
            { role: "user", content: request.question },
            { role: "assistant", content: override.content }
          );
          return createResult(
            intentResult,
            override.content,
            storeIds,
            startDate,
            endDate
          );
        }
      }

      const content = attributionNarrative ?? await generateBusinessAnswer({
              model,
              memory,
              sessionId: request.sessionId,
              question: request.question,
              intent: intentResult.intent,
              analysisData,
              fallbackContent,
              stream: request.stream,
            });

      if (attributionNarrative && request.onAnalysisReady) {
        (request.stream || NOOP_CHAT_STREAM).emitContent(attributionNarrative);
      }

      if (intentResult.intent === "attribution") {
        memory.remember(
          request.sessionId,
          { role: "user", content: request.question },
          { role: "assistant", content }
        );
      }

      return createResult(
        intentResult,
        content,
        storeIds,
        startDate,
        endDate
      );
    },
  };
}

function toSqlMetricIntent(intent: AnalysisIntent): SqlMetricIntent | null {
  return intent === "irrelevant" || intent === "custom_metric" ? null : intent;
}

function resolveStoreIds(
  intentStoreIds: string[],
  requestedStoreIds: string[] | undefined,
  availableStoreIds: string[]
): string[] {
  const clientStoreIds = Array.isArray(requestedStoreIds)
    ? requestedStoreIds
    : [];
  return intentStoreIds.length > 0
    ? intentStoreIds.filter((id) => availableStoreIds.includes(id))
    : clientStoreIds.length > 0
      ? clientStoreIds.filter((id) => availableStoreIds.includes(id))
      : availableStoreIds;
}

interface BusinessAnswerInput {
  model: AgentModel;
  memory: AgentMemory;
  sessionId: string;
  question: string;
  intent: string;
  analysisData: Record<string, unknown> | null;
  fallbackContent: string;
  stream?: ChatStreamCallbacks;
}

async function generateBusinessAnswer({
  model,
  memory,
  sessionId,
  question,
  intent,
  analysisData,
  fallbackContent,
  stream,
}: BusinessAnswerInput): Promise<string> {
  const prompt = [
    "## 用户问题",
    question,
    "",
    "## 分析意图",
    intent,
    "",
    "## 计算模块结果",
    serializePromptData(analysisData),
    "",
    "## 本地计算摘要",
    fallbackContent,
    "",
    "请仅依据以上数据生成回答。",
  ].join("\n");
  const streamCallbacks = stream || NOOP_CHAT_STREAM;
  streamCallbacks.emitStatus("reasoning");
  let answered = false;
  const content = await model.complete({
    systemPrompt: BUSINESS_SYSTEM_PROMPT,
    messages: [
      ...memory.history(sessionId),
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    onReasoning: (delta) => streamCallbacks.emitReasoning(delta),
    onToken: (delta) => {
      if (!answered) {
        answered = true;
        streamCallbacks.emitStatus("answering");
      }
      streamCallbacks.emitContent(delta);
    },
  });
  const result = content || fallbackContent;

  memory.remember(
    sessionId,
    { role: "user", content: question },
    { role: "assistant", content: result }
  );
  return result;
}

function createResult(
  intentResult: IntentResult,
  content: string,
  storeIds: string[],
  startDate: string,
  endDate: string
): BusinessAgentResult {
  return {
    intentResult,
    content,
    storeIds,
    startDate,
    endDate,
  };
}

/**
 * 归因增强：scope 含多家门店时，执行 compare 指标并合并为 storeComparison 快照。
 * compare 失败不阻断归因主流程（降级为仅有合并数据）。
 */
async function enrichAttributionWithComparison(
  metricQueryExecutor: SqlMetricQueryExecutor,
  storeIds: string[],
  startDate: string,
  endDate: string,
  analysisData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (storeIds.length < 2) return analysisData;
  try {
    const comparison = await metricQueryExecutor.execute("compare", {
      storeIds,
      startDate,
      endDate,
    });
    if (comparison.data) {
      return { ...analysisData, storeComparison: comparison.data };
    }
  } catch (error) {
    console.error(
      "Failed to enrich attribution with store comparison:",
      error instanceof Error ? error.name : "UnknownError"
    );
  }
  return analysisData;
}
