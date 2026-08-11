import type { NextRequest } from "next/server";
import {
  authenticateRequest,
  unauthenticatedResponse,
} from "@/modules/auth/auth-http";
import {
  type ChatApplication,
  ChatApplicationError,
  type ChatCommand,
} from "./chat-application";
import { chatApplication } from "./chat-composition";
import { jsonError, streamChatResponse } from "./sse-response";

export async function handleChatHttpRequest(
  request: NextRequest,
  application: ChatApplication = chatApplication
): Promise<Response> {
  const user = await authenticateRequest(request);
  if (!user) return unauthenticatedResponse();
  const command = (await request.json().catch(() => ({}))) as Partial<
    ChatCommand
  >;

  try {
    const result = await application.execute({
      question: command.question || "",
      userId: user.id,
      sessionId: command.sessionId,
      storeIds: command.storeIds,
      startDate: command.startDate,
      endDate: command.endDate,
    });

    return streamChatResponse(
      result.intentResult,
      result.content,
      result.storeIds,
      result.startDate,
      result.endDate
    );
  } catch (error) {
    if (error instanceof ChatApplicationError) {
      if (error.code === "MISSING_QUESTION") {
        return jsonError(error.message, 400);
      }
      if (error.code === "ACCESS_DENIED") {
        return jsonError(error.message, 403);
      }
      console.error("Failed to load sales data:", error.cause || error);
      return jsonError(error.message, 500);
    }

    console.error("Unexpected chat request failure:", error);
    return jsonError("Chat request failed", 500);
  }
}
