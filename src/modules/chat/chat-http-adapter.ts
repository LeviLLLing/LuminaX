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
import { jsonError } from "./sse-response";
import type { ChatStreamCallbacks } from "./chat-stream";

export async function handleChatHttpRequest(
  request: NextRequest,
  application: ChatApplication = chatApplication
): Promise<Response> {
  const user = await authenticateRequest(request);
  if (!user) return unauthenticatedResponse();
  const command = (await request.json().catch(() => ({}))) as Partial<
    ChatCommand
  >;
  const question = typeof command.question === "string" ? command.question : "";
  const queue = new ChatEventQueue();
  let contentStreamed = false;
  const state: {
    earlyError: { status: number; message: string } | null;
  } = { earlyError: null };

  const callbacks: ChatStreamCallbacks = {
    emitStatus: (status) =>
      queue.push(encodeEvent({ type: "status", status })),
    // 推理过程不向客户端下发，避免暴露提示词/内部指令；
    // 后端能力保留，后续如需展示可在此开启。
    emitReasoning: () => undefined,
    emitContent: (delta) => {
      contentStreamed = true;
      queue.push(encodeEvent({ type: "content", content: delta }));
    },
    emitInsight: (event) =>
      queue.push(encodeEvent({ type: "insight", ...event })),
  };

  // 执行与流式事件并行：execute 期间通过 callbacks 实时入队；
  // 若在任何事件发出前失败，仍可返回 JSON 错误（保持公开契约）。
  const runPromise = (async () => {
    try {
      const result = await application.execute({
        question,
        userId: user.id,
        sessionId: command.sessionId,
        storeIds: command.storeIds,
        startDate: command.startDate,
        endDate: command.endDate,
        stream: callbacks,
      });
      queue.push(
        encodeEvent({
          type: "intent",
          intent: result.intentResult.intent,
          storeIds: result.storeIds,
          startDate: result.startDate,
          endDate: result.endDate,
        })
      );
      if (!contentStreamed && result.content) {
        queue.push(encodeEvent({ type: "content", content: result.content }));
      }
      queue.close();
    } catch (error) {
      const mapped = mapChatError(error);
      if (queue.isEmpty()) {
        state.earlyError = mapped;
        queue.close();
      } else {
        queue.push(encodeEvent({ type: "error", error: mapped.message }));
        queue.close();
      }
    }
  })();

  const first = await queue.firstEvent;
  if (first === "closed") {
    await runPromise;
    if (state.earlyError) {
      return jsonError(state.earlyError.message, state.earlyError.status);
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      while (true) {
        const item = await queue.next();
        if (item === null) break;
        controller.enqueue(new TextEncoder().encode(item));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function encodeEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function mapChatError(error: unknown): { status: number; message: string } {
  if (error instanceof ChatApplicationError) {
    if (error.code === "MISSING_QUESTION") {
      return { status: 400, message: error.message };
    }
    if (error.code === "ACCESS_DENIED") {
      return { status: 403, message: error.message };
    }
    console.error("Failed to load sales data:", error.cause || error);
    return { status: 500, message: error.message };
  }
  console.error("Unexpected chat request failure:", error);
  return { status: 500, message: "Chat request failed" };
}

class ChatEventQueue {
  private items: string[] = [];
  private waiters: Array<() => void> = [];
  private done = false;
  private firstResolve: ((value: "event" | "closed") => void) | null = null;

  readonly firstEvent: Promise<"event" | "closed">;

  constructor() {
    this.firstEvent = new Promise((resolve) => {
      this.firstResolve = resolve;
    });
  }

  push(item: string): void {
    this.items.push(item);
    const waiter = this.waiters.shift();
    if (waiter) waiter();
    if (this.firstResolve) {
      this.firstResolve("event");
      this.firstResolve = null;
    }
  }

  close(): void {
    if (this.done) return;
    this.done = true;
    while (this.waiters.length) this.waiters.shift()!();
    if (this.firstResolve) {
      this.firstResolve("closed");
      this.firstResolve = null;
    }
  }

  isEmpty(): boolean {
    return this.items.length === 0 && !this.done;
  }

  async next(): Promise<string | null> {
    while (this.items.length === 0) {
      if (this.done) return null;
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    return this.items.shift()!;
  }
}
