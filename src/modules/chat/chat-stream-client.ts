"use client";

import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import {
  DEFAULT_END_DATE,
  DEFAULT_START_DATE,
} from "@/modules/domain/constants";
import type { IntentViewMetadata } from "@/modules/chat/view-router";

export interface ChatStreamRequest {
  question: string;
  sessionId: string;
  storeIds?: string[];
  startDate?: string;
  endDate?: string;
}

export interface ChatStreamHandlers {
  onIntent: (metadata: IntentViewMetadata) => void;
  onContent: (content: string) => void;
}

export interface ChatStreamPayload {
  type?: "intent" | "content";
  intent?: AnalysisIntent;
  storeIds?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  content?: unknown;
}

export class ChatStreamError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ChatStreamError";
  }
}

export async function streamChatMessage(
  request: ChatStreamRequest,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
): Promise<AnalysisIntent | null> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (response.status === 401) {
    window.location.replace("/login?next=/");
    throw new ChatStreamError(401, "登录状态已失效，请重新登录。");
  }
  if (!response.ok) {
    throw new ChatStreamError(
      response.status,
      await readChatErrorMessage(response)
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Chat response has no stream");

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let receivedIntent: AnalysisIntent | null = null;

  const consumeEvent = (event: string) => {
    for (const payload of parseServerSentEvent(event)) {
      if (payload.type === "intent" && payload.intent) {
        const metadata = normalizeIntentMetadata(payload);
        receivedIntent = metadata.intent;
        handlers.onIntent(metadata);
      }

      if (
        (payload.type === "content" || !payload.type) &&
        typeof payload.content === "string"
      ) {
        fullContent += payload.content;
        handlers.onContent(fullContent);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";
    events.forEach(consumeEvent);
  }

  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);

  return receivedIntent;
}

async function readChatErrorMessage(response: Response): Promise<string> {
  const fallback =
    response.status === 403
      ? "当前账号没有权限访问该指标所需的数据。"
      : "AI 服务暂时不可用，请稍后重试。";
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string" && payload.error.trim()
      ? payload.error.trim()
      : fallback;
  } catch {
    return fallback;
  }
}

export function parseServerSentEvent(event: string): ChatStreamPayload[] {
  return event
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .flatMap((line) => {
      const data = line.slice(6);
      if (data === "[DONE]") return [];
      try {
        return [JSON.parse(data) as ChatStreamPayload];
      } catch {
        return [];
      }
    });
}

function normalizeIntentMetadata(
  payload: ChatStreamPayload
): IntentViewMetadata {
  return {
    intent: payload.intent || "irrelevant",
    storeIds: Array.isArray(payload.storeIds)
      ? payload.storeIds.filter((id): id is string => typeof id === "string")
      : [],
    startDate:
      typeof payload.startDate === "string"
        ? payload.startDate
        : DEFAULT_START_DATE,
    endDate:
      typeof payload.endDate === "string" ? payload.endDate : DEFAULT_END_DATE,
  };
}
