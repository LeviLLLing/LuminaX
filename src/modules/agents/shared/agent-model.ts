export type AgentMessageRole = "user" | "assistant";

export interface AgentMessage {
  role: AgentMessageRole;
  content: string;
}

export interface AgentModelRequest {
  systemPrompt: string;
  messages: AgentMessage[];
  temperature?: number;
}

export interface AgentModel {
  readonly modelName: string;
  complete(request: AgentModelRequest): Promise<string | null>;
}
