"use client";

import type { KeyboardEvent, RefObject } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import {
  BRAND_BLACK,
  BRAND_YELLOW,
} from "@/modules/domain/constants";
import type { ChatMessage, ViewMode } from "@/modules/domain/ui-types";

interface ChatPanelProps {
  viewMode: ViewMode;
  messages: ChatMessage[];
  inputValue: string;
  isStreaming: boolean;
  chatAreaRef: RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onSendMessage: () => void;
}

export function ChatPanel({
  viewMode,
  messages,
  inputValue,
  isStreaming,
  chatAreaRef,
  onInputChange,
  onSendMessage,
}: ChatPanelProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSendMessage();
    }
  };

  return (
    <div
      className={`flex flex-col bg-background ${
        viewMode === "chat" ? "w-full" : "w-[32%]"
      }`}
    >
      <div
        className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{ backgroundColor: BRAND_BLACK }}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold"
          style={{ backgroundColor: BRAND_YELLOW, color: BRAND_BLACK }}
        >
          L
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: BRAND_YELLOW }}>
            灵犀智能引擎
          </h3>
          <p className="text-xs" style={{ color: "rgba(255,230,0,0.6)" }}>
            为您分析销售数据，提供运营建议
          </p>
        </div>
      </div>

      <div
        ref={chatAreaRef}
        className="flex-1 overflow-y-auto p-3 space-y-3"
        style={{ backgroundColor: "#f8f9fa" }}
      >
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                msg.role === "user"
                  ? ""
                  : msg.role === "system"
                    ? "bg-amber-100 text-amber-700"
                    : ""
              }`}
              style={
                msg.role === "user"
                  ? { backgroundColor: BRAND_BLACK, color: BRAND_YELLOW }
                  : msg.role === "ai"
                    ? { backgroundColor: BRAND_YELLOW, color: BRAND_BLACK }
                    : undefined
              }
            >
              {msg.role === "user" ? "U" : msg.role === "ai" ? "L" : "i"}
            </div>
            <div
              className={`max-w-[80%] px-3 py-2.5 rounded-lg text-[13px] leading-relaxed ${
                msg.role === "user"
                  ? ""
                  : msg.role === "system"
                    ? "bg-amber-50 text-amber-700 text-xs border border-amber-200"
                    : "bg-card text-foreground border border-border"
              }`}
              style={
                msg.role === "user"
                  ? { backgroundColor: BRAND_BLACK, color: BRAND_YELLOW }
                  : undefined
              }
            >
              {msg.isLoading ? (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              ) : (
                <MarkdownRenderer content={msg.content} />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border flex gap-2 flex-shrink-0">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入您的问题..."
          disabled={isStreaming}
          className="flex-1 px-3 py-2.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
        />
        <button
          onClick={onSendMessage}
          disabled={isStreaming || !inputValue.trim()}
          className="px-5 py-2.5 rounded-md text-sm font-semibold disabled:opacity-50 transition-colors"
          style={{ backgroundColor: BRAND_YELLOW, color: BRAND_BLACK }}
        >
          发送
        </button>
      </div>
    </div>
  );
}
