import { randomUUID } from "node:crypto";
import {
  type BusinessAgent,
  BusinessAgentError,
} from "@/modules/agents/business/business-agent";
import type { GovernanceAgent } from "@/modules/agents/governance/governance-agent";
import {
  DEFAULT_END_DATE,
  DEFAULT_START_DATE,
} from "@/modules/domain/constants";
import type { IntentResult } from "@/modules/intent/intent-classifier";
import {
  NOOP_CHAT_STREAM,
  type ChatStreamCallbacks,
} from "@/modules/chat/chat-stream";
import {
  buildInsightReceipt,
  type InsightApplication,
} from "@/modules/insights/insight-application";
import { shouldGenerateInsight } from "@/modules/insights/insight-trigger-policy";

export interface ChatCommand {
  question: string;
  userId?: string;
  sessionId?: string;
  storeIds?: string[];
  startDate?: string;
  endDate?: string;
  stream?: ChatStreamCallbacks;
}

export interface ChatResult {
  intentResult: IntentResult;
  content: string;
  storeIds: string[];
  startDate: string;
  endDate: string;
}

export interface ChatApplication {
  execute(command: ChatCommand): Promise<ChatResult>;
}

export interface ChatApplicationDependencies {
  governanceAgent: GovernanceAgent;
  businessAgent: BusinessAgent;
  insightApplication?: InsightApplication;
}

export class ChatApplicationError extends Error {
  constructor(
    public readonly code:
      | "MISSING_QUESTION"
      | "DATA_NOT_LOADED"
      | "ACCESS_DENIED",
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ChatApplicationError";
  }
}

export function createChatApplication({
  governanceAgent,
  businessAgent,
  insightApplication,
}: ChatApplicationDependencies): ChatApplication {
  return {
    async execute(command) {
      const question = command.question?.trim();
      if (!question) {
        throw new ChatApplicationError(
          "MISSING_QUESTION",
          "Missing question"
        );
      }

      const sessionId = command.sessionId?.trim() || randomUUID();
      const userId = command.userId?.trim() || "system-admin";
      const stream = command.stream || NOOP_CHAT_STREAM;
      const insightToken = insightApplication
        ? insightApplication.beginRequest(userId, randomUUID(), Date.now())
        : null;
      let insightPlanObserved = false;
      let insightRequestActive = false;
      stream.emitStatus("governance");
      const governanceResult = await governanceAgent.review({
        sessionId,
        question,
      });

      if (governanceResult.decision === "reject") {
        return {
          intentResult: createRejectedIntentResult(),
          content: governanceResult.userMessage,
          storeIds: [],
          startDate: command.startDate || DEFAULT_START_DATE,
          endDate: command.endDate || DEFAULT_END_DATE,
        };
      }

      stream.emitStatus("computing");
      try {
        return await businessAgent.execute({
          ...governanceResult.handoff,
          userId,
          storeIds: command.storeIds,
          startDate: command.startDate,
          endDate: command.endDate,
          stream,
          onAnalysisPlanned:
            insightApplication && insightToken
              ? (intent) => {
                  insightPlanObserved = true;
                  if (shouldGenerateInsight(intent)) {
                    insightRequestActive = insightApplication.activateRequest(
                      insightToken
                    );
                  }
                }
              : undefined,
          onAnalysisReady:
            insightApplication && insightToken
              ? async (analysis) => {
                  if (!shouldGenerateInsight(analysis.intent)) return null;
                  if (!insightPlanObserved) {
                    insightRequestActive = insightApplication.activateRequest(
                      insightToken
                    );
                  }
                  if (!insightRequestActive) return null;
                  stream.emitInsight({ status: "generating" });
                  try {
                    const snapshot = await insightApplication.generateForAnalysis(
                      insightToken,
                      analysis
                    );
                    stream.emitInsight({
                      status: "updated",
                      insightId: snapshot.id,
                      findingCount: snapshot.findings.length,
                      actionCount: snapshot.actions.length,
                    });
                    return { content: buildInsightReceipt(snapshot) };
                  } catch (error) {
                    console.error(
                      "Insight projection failed:",
                      error instanceof Error ? error.name : "UnknownError"
                    );
                    stream.emitInsight({ status: "failed" });
                    return null;
                  }
                }
              : undefined,
        });
      } catch (error) {
        if (
          error instanceof BusinessAgentError &&
          error.code === "DATA_NOT_LOADED"
        ) {
          throw new ChatApplicationError(
            "DATA_NOT_LOADED",
            error.message,
            { cause: error.cause || error }
          );
        }
        if (
          error instanceof BusinessAgentError &&
          error.code === "ACCESS_DENIED"
        ) {
          throw new ChatApplicationError("ACCESS_DENIED", error.message, {
            cause: error.cause || error,
          });
        }
        throw error;
      }
    },
  };
}

function createRejectedIntentResult(): IntentResult {
  return {
    intent: "irrelevant",
    storeIds: [],
    startDate: null,
    endDate: null,
    relevant: false,
    outOfScope: true,
  };
}
