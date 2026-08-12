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
    const shouldStream = Boolean(request.onReasoning || request.onToken);

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
            stream: shouldStream,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        console.error(`DeepSeek model request failed: ${response.status}`);
        return null;
      }

      if (shouldStream) {
        return await readStreamingResponse(
          response,
          request.onReasoning,
          request.onToken
        );
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

async function readStreamingResponse(
  response: Response,
  onReasoning?: (delta: string) => void,
  onToken?: (delta: string) => void
): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";

  const processChunk = (chunk: string): void => {
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string; reasoning_content?: string };
          }>;
        };
        const delta = payload.choices?.[0]?.delta;
        if (!delta) continue;
        if (typeof delta.reasoning_content === "string") {
          onReasoning?.(delta.reasoning_content);
        }
        if (typeof delta.content === "string" && delta.content) {
          onToken?.(delta.content);
          fullContent += delta.content;
        }
      } catch {
        // 忽略无法解析的 SSE 行
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    processChunk(lines.join("\n"));
  }
  buffer += decoder.decode();
  if (buffer.trim()) processChunk(buffer);

  return fullContent.trim() || null;
}
