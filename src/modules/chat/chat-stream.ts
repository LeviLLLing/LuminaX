export type ChatStatus =
  | "governance"
  | "computing"
  | "reasoning"
  | "answering";

export interface ChatStreamCallbacks {
  emitStatus(status: ChatStatus): void;
  emitReasoning(delta: string): void;
  emitContent(delta: string): void;
}

export const NOOP_CHAT_STREAM: ChatStreamCallbacks = {
  emitStatus() {},
  emitReasoning() {},
  emitContent() {},
};
