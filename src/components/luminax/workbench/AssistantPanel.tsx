"use client";

import type { FormEvent, RefObject } from "react";
import { Bot, Info, Send, UserRound } from "lucide-react";
import { DecisionBrief } from "@/components/luminax/workbench/DecisionBrief";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatMessage } from "@/modules/domain/ui-types";
import type { InsightSnapshotDto } from "@/modules/insights/insight-types";
import type { WorkbenchPresentationProfile } from "@/modules/workbench/workbench-presentation";

interface AssistantPanelProps {
  insight: InsightSnapshotDto | null;
  insightGenerationStatus: "idle" | "generating" | "failed";
  pendingInsightActionIds: string[];
  assistantMode: WorkbenchPresentationProfile["assistantMode"];
  messages: ChatMessage[];
  inputValue: string;
  isStreaming: boolean;
  status?: string | null;
  suggestions: string[];
  chatAreaRef: RefObject<HTMLDivElement | null>;
  onInputChange(value: string): void;
  onSendMessage(question?: string): void;
  onOpenInsight(): void;
}

export function AssistantPanel({
  insight,
  insightGenerationStatus,
  pendingInsightActionIds,
  assistantMode,
  messages,
  inputValue,
  isStreaming,
  status,
  suggestions,
  chatAreaRef,
  onInputChange,
  onSendMessage,
  onOpenInsight,
}: AssistantPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSendMessage();
  }

  const authorizedSuggestions = suggestions.slice(0, 3);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-3 py-2 sm:px-4">
        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--luminax-yellow)] text-[var(--luminax-ink)]">
          <Bot className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            灵犀助手
          </h2>
          <p className="truncate text-xs text-muted-foreground">分析决策</p>
        </div>
      </header>

      {authorizedSuggestions.length > 0 && (
        <div className="shrink-0 border-b border-border bg-[var(--luminax-canvas)] px-3 py-2.5 sm:px-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">快捷提问</p>
          <div className="grid gap-1.5">
            {authorizedSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={isStreaming}
                onClick={() => onSendMessage(suggestion)}
                className="min-w-0 rounded-md border border-border bg-white px-3 py-2 text-left text-xs leading-5 font-medium whitespace-normal text-foreground transition-colors hover:border-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <DecisionBrief
        insight={insight}
        generationStatus={insightGenerationStatus}
        pendingActionIds={pendingInsightActionIds}
        assistantMode={assistantMode}
        onOpenInsight={onOpenInsight}
      />

      <div
        ref={chatAreaRef}
        aria-live="polite"
        className="min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto bg-[var(--luminax-canvas)] p-3 sm:p-4"
      >
        {messages.map((message, index) => (
          <Message key={index} message={message} />
        ))}
        {isStreaming && status && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-[var(--luminax-yellow)]" />
            {status}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 border-t border-border bg-white p-3"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="输入您的问题..."
          aria-label="分析问题"
          disabled={isStreaming}
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-white px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground focus:border-foreground focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="submit"
              title="发送"
              aria-label="发送"
              disabled={isStreaming || !inputValue.trim()}
              className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--luminax-yellow)] text-[var(--luminax-ink)] transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
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
        className={`grid size-7 shrink-0 place-items-center rounded-md border ${
          isUser
            ? "border-[var(--luminax-ink)] bg-[var(--luminax-ink)] text-white"
            : isSystem
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-[var(--luminax-yellow)] bg-[var(--luminax-yellow)] text-[var(--luminax-ink)]"
        }`}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </div>
      <div
        className={`min-w-0 max-w-[88%] overflow-x-auto rounded-md border px-3 py-2.5 text-[13px] leading-relaxed break-words ${
          isUser
            ? "border-[var(--luminax-ink)] bg-[var(--luminax-ink)] text-white"
            : isSystem
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-border bg-white text-foreground"
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
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
