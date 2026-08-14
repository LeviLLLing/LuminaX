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
  StaleInsightGenerationError,
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
      const insightGeneration = insightToken
        ? { requestId: insightToken.requestId, startedAt: insightToken.startedAt }
        : undefined;
      let insightPlanObserved = false;
      let insightRequestActive = false;
      let insightLifecycleStarted = false;
      let insightLifecycleFinalized = false;
      const activateInsightRequest = async (): Promise<
        "active" | "superseded" | "unavailable"
      > => {
        if (!insightApplication || !insightToken) return "superseded";
        try {
          return (await insightApplication.activateRequest(insightToken))
            ? "active"
            : "superseded";
        } catch (error) {
          console.error(
            "Insight generation claim failed:",
            error instanceof Error ? error.name : "UnknownError"
          );
          return "unavailable";
        }
      };
      const startInsightLifecycle = () => {
        if (!insightGeneration || insightLifecycleStarted) return;
        insightLifecycleStarted = true;
        stream.emitInsight({ status: "generating", generation: insightGeneration });
      };
      const emitInsightFailure = () => {
        if (!insightLifecycleStarted || insightLifecycleFinalized) return;
        insightLifecycleFinalized = true;
        stream.emitInsight({ status: "failed", generation: insightGeneration });
      };
      const failCurrentInsightLifecycle = async () => {
        if (!insightLifecycleStarted || insightLifecycleFinalized) return;
        if ((await activateInsightRequest()) === "superseded") return;
        emitInsightFailure();
      };
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
        const result = await businessAgent.execute({
          ...governanceResult.handoff,
          userId,
          storeIds: command.storeIds,
          startDate: command.startDate,
          endDate: command.endDate,
          stream,
          onAnalysisPlanned:
            insightApplication && insightToken
              ? async (intent) => {
                  insightPlanObserved = true;
                  if (shouldGenerateInsight(intent)) {
                    insightRequestActive = (await activateInsightRequest()) === "active";
                    if (insightRequestActive) startInsightLifecycle();
                  }
                }
              : undefined,
          onAnalysisReady:
            insightApplication && insightToken
              ? async (analysis) => {
                  if (!shouldGenerateInsight(analysis.intent)) return null;
                  if (!insightPlanObserved) {
                    insightRequestActive = (await activateInsightRequest()) === "active";
                    if (insightRequestActive) startInsightLifecycle();
                  }
                  if (insightRequestActive) {
                    const activation = await activateInsightRequest();
                    insightRequestActive = activation === "active";
                    if (activation === "unavailable") emitInsightFailure();
                  }
                  if (!insightRequestActive) return null;
                  try {
                    const snapshot = await insightApplication.generateForAnalysis(
                      insightToken,
                      analysis
                    );
                    insightLifecycleFinalized = true;
                    stream.emitInsight({
                      status: "updated",
                      insightId: snapshot.id,
                      findingCount: snapshot.findings.length,
                      actionCount: snapshot.actions.length,
                      generation: insightGeneration,
                    });
                    return { content: buildInsightReceipt(snapshot) };
                  } catch (error) {
                    if (error instanceof StaleInsightGenerationError) return null;
                    const activation = await activateInsightRequest();
                    if (activation === "superseded") return null;
                    console.error(
                      "Insight projection failed:",
                      error instanceof Error ? error.name : "UnknownError"
                    );
                    emitInsightFailure();
                    return null;
                  }
                }
              : undefined,
        });
        await failCurrentInsightLifecycle();
        return result;
      } catch (error) {
        await failCurrentInsightLifecycle();
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
