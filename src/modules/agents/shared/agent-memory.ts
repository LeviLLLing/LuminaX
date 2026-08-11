import type { AgentMessage } from "./agent-model";

export interface AgentMemory {
  history(sessionId: string): AgentMessage[];
  remember(sessionId: string, ...messages: AgentMessage[]): void;
  clear(sessionId: string): void;
}

export class InMemoryAgentMemory implements AgentMemory {
  private readonly sessions = new Map<string, AgentMessage[]>();

  constructor(
    private readonly maxMessagesPerSession = 12,
    private readonly maxSessions = 500
  ) {}

  history(sessionId: string): AgentMessage[] {
    return [...(this.sessions.get(sessionId) || [])];
  }

  remember(sessionId: string, ...messages: AgentMessage[]): void {
    if (!this.sessions.has(sessionId) && this.sessions.size >= this.maxSessions) {
      const oldestSessionId = this.sessions.keys().next().value;
      if (oldestSessionId) this.sessions.delete(oldestSessionId);
    }

    const history = this.sessions.get(sessionId) || [];
    history.push(...messages);
    this.sessions.set(
      sessionId,
      history.slice(-this.maxMessagesPerSession)
    );
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
