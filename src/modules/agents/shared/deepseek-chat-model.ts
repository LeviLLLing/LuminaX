import type {
  AgentModel,
  AgentModelRequest,
} from "@/modules/agents/shared/agent-model";

export interface DeepSeekChatModelOptions {
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class DeepSeekChatModel implements AgentModel {
  readonly modelName: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: DeepSeekChatModelOptions) {
    this.modelName = options.model;
    this.baseUrl =
      options.baseUrl ||
      process.env.DEEPSEEK_BASE_URL ||
      "https://api.deepseek.com";
    this.timeoutMs =
      options.timeoutMs ||
      Number(process.env.DEEPSEEK_TIMEOUT_MS || 20000);
  }

  async complete(request: AgentModelRequest): Promise<string | null> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.modelName,
            messages: [
              { role: "system", content: request.systemPrompt },
              ...request.messages,
            ],
            temperature: request.temperature ?? 0.2,
            stream: false,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        console.error(`DeepSeek model request failed: ${response.status}`);
        return null;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return payload.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      console.error(
        "DeepSeek model request failed:",
        error instanceof Error ? error.name : "UnknownError"
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
