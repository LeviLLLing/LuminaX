"use client";

import { useCallback, useRef, useState } from "react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import type { ChatMessage } from "@/modules/domain/ui-types";
import type { InsightStreamEvent } from "@/modules/insights/insight-types";
import {
  CHAT_STATUS_LABELS,
  ChatStreamError,
  streamChatMessage,
} from "@/modules/chat/chat-stream-client";
import {
  getIntentModeLabel,
  shouldAppendModeActivation,
  type IntentViewMetadata,
} from "@/modules/chat/view-router";

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    role: "ai",
    content: "您好，我是灵犀助手。请问您想了解什么？",
  },
];

interface UseChatStreamInput {
  onIntentMetadata: (metadata: IntentViewMetadata) => void;
  onInsightEvent?: (event: InsightStreamEvent) => void;
}

export function useChatStream({ onIntentMetadata, onInsightEvent }: UseChatStreamInput) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [sessionId] = useState(createChatSessionId);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  useAutoScroll(chatAreaRef, messages);

  const sendMessage = useCallback(async (questionOverride?: string) => {
    const question = (questionOverride ?? inputValue).trim();
    if (!question || isStreaming) return;

    setInputValue("");
    setStatus(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "ai", content: "", isLoading: true },
    ]);
    setIsStreaming(true);

    try {
      const abortController = new AbortController();
      streamAbortRef.current = abortController;

      setMessages((prev) =>
        replaceLastMessage(prev, { role: "ai", content: "", isLoading: false })
      );
      const receivedIntent = await streamChatMessage(
        { question, sessionId },
        {
          onIntent: onIntentMetadata,
          onInsight: onInsightEvent,
          onContent: (content) => {
            setMessages((prev) =>
              replaceLastMessage(prev, {
                role: "ai",
                content,
                isLoading: false,
              })
            );
          },
          onStatus: (nextStatus) =>
            setStatus(CHAT_STATUS_LABELS[nextStatus] || nextStatus),
        },
        abortController.signal
      );

      if (receivedIntent && shouldAppendModeActivation(receivedIntent)) {
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: `${getIntentModeLabel(receivedIntent)}模式已激活`,
          },
        ]);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        const message =
          error instanceof ChatStreamError && error.status < 500
            ? error.message
            : "AI 服务暂时不可用，请稍后重试。";
        setMessages((prev) =>
          replaceLastMessage(prev, {
            role: "ai",
            content: `*${message}*`,
            isLoading: false,
          })
        );
      }
    } finally {
      setIsStreaming(false);
      streamAbortRef.current = null;
    }
  }, [inputValue, isStreaming, onInsightEvent, onIntentMetadata, sessionId]);

  return {
    chatAreaRef,
    inputValue,
    isStreaming,
    messages,
    sendMessage,
    setInputValue,
    status,
  };
}

function replaceLastMessage(
  messages: ChatMessage[],
  message: ChatMessage
): ChatMessage[] {
  const updated = [...messages];
  updated[updated.length - 1] = message;
  return updated;
}

function createChatSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `luminax-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
