import { ATTRIBUTION_SYSTEM_PROMPT } from "@/modules/agents/prompts/attribution-system-prompt";
import type { AgentMemory } from "@/modules/agents/shared/agent-memory";
import type { AgentModel } from "@/modules/agents/shared/agent-model";
import {
  extractJsonObject,
  serializePromptData,
} from "@/modules/agents/shared/prompt-utils";
import { localizeFactorName } from "@/modules/attribution/attribution-labels";
import type {
  AttributionKnowledgeDocument,
  AttributionKnowledgeRetriever,
} from "./attribution-rag";

export interface AttributionAgentRequest {
  sessionId: string;
  question: string;
  analysisData: Record<string, unknown>;
  fallbackContent: string;
}

export interface AttributionAgent {
  analyze(request: AttributionAgentRequest): Promise<string>;
}

export interface AttributionAgentDependencies {
  model: AgentModel;
  memory: AgentMemory;
  knowledgeRetriever: AttributionKnowledgeRetriever;
}

export function createAttributionAgent({
  model,
  memory,
  knowledgeRetriever,
}: AttributionAgentDependencies): AttributionAgent {
  return {
    async analyze(request) {
      const documents = await retrieveKnowledgeSafely(
        knowledgeRetriever,
        request
      );
      const prompt = buildAttributionPrompt(request, documents);
      const content = await model.complete({
        systemPrompt: ATTRIBUTION_SYSTEM_PROMPT,
        messages: [
          ...memory.history(request.sessionId),
          { role: "user", content: prompt },
        ],
        temperature: 0.15,
      });
      // 优先解析结构化 JSON；解析失败则原样返回模型文本（兼容旧行为）
      const result = content
        ? renderModelOutput(content)
        : request.fallbackContent;

      memory.remember(
        request.sessionId,
        { role: "user", content: request.question },
        { role: "assistant", content: result }
      );
      return result;
    },
  };
}

function renderModelOutput(content: string): string {
  const parsed = extractJsonObject(content);
  if (!parsed) return content;
  const structured = renderStructuredAttribution(parsed);
  return structured || content;
}

/**
 * 把归因数据中机器可读的因子名替换为中文标签，再交给模型，
 * 避免回答里夹杂英文因子 ID。
 */
function toLocalizedAnalysisData(
  data: Record<string, unknown>
): Record<string, unknown> {
  const factors = Array.isArray(data.factorContributions)
    ? data.factorContributions.map((item) => {
        const factor = item as Record<string, unknown>;
        return {
          ...factor,
          factor:
            typeof factor.label === "string" ? factor.label : factor.factor,
        };
      })
    : data.factorContributions;
  return { ...data, factorContributions: factors };
}

function renderStructuredAttribution(
  parsed: Record<string, unknown>
): string | null {
  if (typeof parsed.mainIssue !== "string" || !Array.isArray(parsed.factors)) {
    return null;
  }
  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary
      : `主要问题：${parsed.mainIssue}`;
  const factors = parsed.factors
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    )
    .slice(0, 5);
  const actions = Array.isArray(parsed.actions)
    ? parsed.actions.filter((item): item is string => typeof item === "string")
    : [];
  const metrics = Array.isArray(parsed.validationMetrics)
    ? parsed.validationMetrics.filter(
        (item): item is string => typeof item === "string"
      )
    : [];

  const lines = ["### 归因结论", summary];
  if (factors.length > 0) {
    lines.push("", "### 影响因子");
    for (const factor of factors) {
      const name =
        typeof factor.factor === "string"
          ? localizeFactorName(factor.factor)
          : "未知因子";
      const contribution =
        typeof factor.contribution === "number" ? factor.contribution : 0;
      const evidence = typeof factor.evidence === "string" ? factor.evidence : "";
      lines.push(
        `- **${name}**：${contribution > 0 ? "+" : ""}${contribution.toLocaleString(
          "zh-CN",
          { maximumFractionDigits: 2 }
        )}（${evidence}）`
      );
    }
  }
  if (actions.length > 0) {
    lines.push("", "### 经营建议");
    actions.forEach((action, index) => lines.push(`${index + 1}. ${action}`));
  }
  if (metrics.length > 0) {
    lines.push("", "### 验证指标");
    metrics.forEach((metric) => lines.push(`- ${metric}`));
  }
  return lines.join("\n");
}

async function retrieveKnowledgeSafely(
  knowledgeRetriever: AttributionKnowledgeRetriever,
  request: AttributionAgentRequest
): Promise<AttributionKnowledgeDocument[]> {
  try {
    return await knowledgeRetriever.retrieve({
      question: request.question,
      analysisData: request.analysisData,
    });
  } catch (error) {
    console.error(
      "Attribution knowledge retrieval failed:",
      error instanceof Error ? error.name : "UnknownError"
    );
    return [];
  }
}

function buildAttributionPrompt(
  request: AttributionAgentRequest,
  documents: AttributionKnowledgeDocument[]
): string {
  return [
    "## 用户问题",
    request.question,
    "",
    "## 计算模块结果",
    serializePromptData(toLocalizedAnalysisData(request.analysisData)),
    "",
    "## 本地归因摘要",
    request.fallbackContent,
    "",
    "## RAG 经营知识",
    documents.length > 0
      ? documents
          .map(
            (document, index) =>
              `[${index + 1}] ${document.title}\n${document.content}`
          )
          .join("\n\n")
      : "当前未检索到额外经营知识，仅使用计算数据进行分析。",
    "",
    "请严格按照 System Prompt 的固定结构输出归因结论和建议。",
  ].join("\n");
}
