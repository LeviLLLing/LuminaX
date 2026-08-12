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
      const stream = command.stream || NOOP_CHAT_STREAM;
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
          userId: command.userId?.trim() || "system-admin",
          storeIds: command.storeIds,
          startDate: command.startDate,
          endDate: command.endDate,
          stream,
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
