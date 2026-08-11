import type {
  AgentModel,
  AgentModelRequest,
} from "../../src/modules/agents/shared/agent-model";

export class FakeAgentModel implements AgentModel {
  readonly requests: AgentModelRequest[] = [];

  constructor(
    readonly modelName: string,
    private readonly responder: (
      request: AgentModelRequest
    ) => string | null | Promise<string | null>
  ) {}

  async complete(request: AgentModelRequest): Promise<string | null> {
    this.requests.push(request);
    return this.responder(request);
  }
}
