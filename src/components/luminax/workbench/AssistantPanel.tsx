"use client";

import type { FormEvent, RefObject } from "react";
import { Bot, Info, Send, UserRound } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatMessage } from "@/modules/domain/ui-types";

interface AssistantPanelProps {
  messages: ChatMessage[];
  inputValue: string;
  isStreaming: boolean;
  suggestions: string[];
  chatAreaRef: RefObject<HTMLDivElement | null>;
  onInputChange(value: string): void;
  onSendMessage(question?: string): void;
}

export function AssistantPanel({
  messages,
  inputValue,
  isStreaming,
  suggestions,
  chatAreaRef,
  onInputChange,
  onSendMessage,
}: AssistantPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSendMessage();
  }

  const authorizedSuggestions = suggestions.slice(0, 3);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-[#dedfe2] px-3 py-2 sm:px-4">
        <div className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[#FFE600] text-black">
          <Bot className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#17181a]">
            灵犀助手
          </h2>
          <p className="truncate text-xs text-[#666a73]">分析决策</p>
        </div>
      </header>

      {authorizedSuggestions.length > 0 && (
        <div className="shrink-0 border-b border-[#dedfe2] bg-[#f5f6f7] px-3 py-2.5 sm:px-4">
          <p className="mb-2 text-xs font-medium text-[#666a73]">快捷提问</p>
          <div className="grid gap-1.5">
            {authorizedSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={isStreaming}
                onClick={() => onSendMessage(suggestion)}
                className="min-w-0 rounded-[8px] border border-[#c9cbd0] bg-white px-3 py-2 text-left text-xs leading-5 font-medium whitespace-normal text-[#303238] transition-colors hover:border-[#737780] hover:bg-[#eff0f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={chatAreaRef}
        aria-live="polite"
        className="min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto bg-[#f5f6f7] p-3 sm:p-4"
      >
        {messages.map((message, index) => (
          <Message key={index} message={message} />
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 border-t border-[#dedfe2] bg-white p-3"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="输入您的问题..."
          aria-label="分析问题"
          disabled={isStreaming}
          className="h-10 min-w-0 flex-1 rounded-[8px] border border-[#737780] bg-white px-3 text-sm text-black outline-none transition-colors placeholder:text-[#737780] hover:border-black focus:border-black focus:ring-2 focus:ring-black/20 disabled:cursor-not-allowed disabled:bg-[#eff0f2] disabled:text-[#737780]"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="submit"
              title="发送"
              aria-label="发送"
              disabled={isStreaming || !inputValue.trim()}
              className="grid size-10 shrink-0 place-items-center rounded-[8px] bg-[#FFE600] text-black transition-colors hover:bg-[#ead300] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Send className="size-4" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">发送</TooltipContent>
        </Tooltip>
      </form>
    </section>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const Icon = isUser ? UserRound : isSystem ? Info : Bot;

  return (
    <div className={`flex min-w-0 gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`grid size-7 shrink-0 place-items-center rounded-[8px] border ${
          isUser
            ? "border-[#17181a] bg-[#17181a] text-white"
            : isSystem
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-[#FFE600] bg-[#FFE600] text-black"
        }`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </div>
      <div
        className={`min-w-0 max-w-[88%] overflow-x-auto rounded-[8px] border px-3 py-2.5 text-[13px] leading-relaxed break-words ${
          isUser
            ? "border-[#17181a] bg-[#17181a] text-white"
            : isSystem
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-[#dedfe2] bg-white text-[#303238]"
        }`}
      >
        {message.isLoading ? <LoadingDots /> : <MarkdownRenderer content={message.content} />}
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex h-5 items-center gap-1" aria-label="正在生成回复">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-[#666a73]"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
