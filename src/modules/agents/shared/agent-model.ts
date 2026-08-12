export type AgentMessageRole = "user" | "assistant";

export interface AgentMessage {
  role: AgentMessageRole;
  content: string;
}

export interface AgentModelRequest {
  systemPrompt: string;
  messages: AgentMessage[];
  temperature?: number;
  /** 流式输出：模型推理过程增量（如 DeepSeek reasoning_content） */
  onReasoning?: (delta: string) => void;
  /** 流式输出：最终回答内容增量 */
  onToken?: (delta: string) => void;
}

export interface AgentModel {
  readonly modelName: string;
  complete(request: AgentModelRequest): Promise<string | null>;
}
