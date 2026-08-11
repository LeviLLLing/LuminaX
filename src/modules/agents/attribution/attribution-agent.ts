import { ATTRIBUTION_SYSTEM_PROMPT } from "@/modules/agents/prompts/attribution-system-prompt";
import type { AgentMemory } from "@/modules/agents/shared/agent-memory";
import type { AgentModel } from "@/modules/agents/shared/agent-model";
import { serializePromptData } from "@/modules/agents/shared/prompt-utils";
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
      const result = content || request.fallbackContent;

      memory.remember(
        request.sessionId,
        { role: "user", content: request.question },
        { role: "assistant", content: result }
      );
      return result;
    },
  };
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
    serializePromptData(request.analysisData),
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
