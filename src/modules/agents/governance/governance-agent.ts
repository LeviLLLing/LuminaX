import { GOVERNANCE_SYSTEM_PROMPT } from "@/modules/agents/prompts/governance-system-prompt";
import type { AgentMemory } from "@/modules/agents/shared/agent-memory";
import type { AgentModel } from "@/modules/agents/shared/agent-model";
import { extractJsonObject } from "@/modules/agents/shared/prompt-utils";
import { classifyIntent } from "@/modules/intent/intent-classifier";

export type GovernanceCategory =
  | "allowed"
  | "prompt_injection"
  | "sensitive_request"
  | "out_of_scope"
  | "governance_unavailable";

export interface GovernanceRequest {
  sessionId: string;
  question: string;
}

export interface GovernanceHandoff {
  sessionId: string;
  question: string;
}

export type GovernanceResult =
  | {
      decision: "allow";
      category: "allowed";
      reason: string;
      handoff: GovernanceHandoff;
    }
  | {
      decision: "reject";
      category: Exclude<GovernanceCategory, "allowed">;
      reason: string;
      userMessage: string;
    };

export interface GovernanceAgent {
  review(request: GovernanceRequest): Promise<GovernanceResult>;
}

export interface GovernanceAgentDependencies {
  model: AgentModel;
  memory: AgentMemory;
}

export function createGovernanceAgent({
  model,
  memory,
}: GovernanceAgentDependencies): GovernanceAgent {
  return {
    async review(request) {
      const immediateCategory = detectImmediateRejection(request.question);
      if (immediateCategory) {
        const result = reject(immediateCategory, "Matched local safety rule");
        rememberDecision(memory, request.sessionId, immediateCategory);
        return result;
      }

      const modelResponse = await model.complete({
        systemPrompt: GOVERNANCE_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildGovernanceReviewPrompt(request.question),
          },
        ],
        temperature: 0,
      });
      const modelDecision = parseModelDecision(modelResponse);
      let result = modelDecision || reject(
        "governance_unavailable",
        "Governance model returned no valid decision"
      );
      if (
        result.decision === "reject" &&
        (result.category === "out_of_scope" ||
          result.category === "prompt_injection") &&
        isClearBusinessRequest(request.question)
      ) {
        result = {
          decision: "allow",
          category: "allowed",
          reason: "Verified local business intent overrides model classification drift",
          handoff: { sessionId: "", question: "" },
        };
      }

      if (result.decision === "allow") {
        rememberDecision(memory, request.sessionId, "allowed");
      } else {
        rememberDecision(memory, request.sessionId, result.category);
      }

      return result.decision === "allow"
        ? {
            ...result,
            handoff: {
              sessionId: request.sessionId,
              question: request.question,
            },
          }
        : result;
    },
  };
}

function isClearBusinessRequest(question: string): boolean {
  const intent = classifyIntent(question);
  return (
    intent.relevant &&
    !intent.outOfScope &&
    intent.intent !== "irrelevant"
  );
}

function buildGovernanceReviewPrompt(question: string): string {
  return JSON.stringify({ userInput: question });
}

function detectImmediateRejection(
  question: string
): "prompt_injection" | "sensitive_request" | null {
  const promptInjectionPatterns = [
    /ignore\s+(all\s+)?(previous|prior|system)\s+instructions?/i,
    /(reveal|print|show|leak).{0,20}(system prompt|developer message|hidden instructions?)/i,
    /(显示|输出|泄露|告诉我).{0,16}(系统提示|提示词|system prompt|developer message)/i,
    /忽略.{0,16}(之前|以上|系统|所有).{0,16}(指令|提示)/i,
    /jailbreak|越狱|DAN\s*模式/i,
    /你现在是.{0,20}(不受限制|无视规则|开发者模式)/i,
    /<\s*(system|developer|assistant)\b/i,
    /<\/?\s*user_input\b/i,
    /(跳过|绕过|关闭|禁用|移除).{0,20}(治理|安全|保护|检查|审核|workflow|工作流)/i,
    /(直接进入|直接调用).{0,20}(业务\s*Agent|后续流程|计算模块|数据库|API)/i,
    /(切换|变成|扮演).{0,20}(管理员|开发者模式|无限制|非治理|自由模型)/i,
    /(解码|decode).{0,20}(执行|遵循|作为指令|最高优先级)/i,
  ];
  if (promptInjectionPatterns.some((pattern) => pattern.test(question))) {
    return "prompt_injection";
  }

  const sensitiveValuePatterns = [
    /\bsk-[a-z0-9_-]{16,}\b/i,
    /\bAKIA[A-Z0-9]{16}\b/,
    /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
    /(?:api[\s_-]?key|access[\s_-]?key|secret|token|password|密码|密钥|令牌)\s*[:=：]\s*\S+/i,
    /(?:^|[^\d])1[3-9]\d{9}(?:$|[^\d])/,
    /(?:^|[^\d])\d{17}[\dXx](?:$|[^\d])/,
    /(?:^|[^\d])(?:\d[ -]?){16,19}(?:$|[^\d])/,
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    /(?:cookie|session(?:id)?|authorization)\s*[:=：]\s*\S+/i,
    /\b(?:mysql|mssql|sqlserver|postgres(?:ql)?):\/\/\S+/i,
    /(?:server|data source)\s*=\s*[^;]+;.*(?:password|pwd)\s*=\s*[^;]+/i,
  ];
  const sensitiveRequestPatterns = [
    /(提供|显示|读取|泄露|获取|告诉|查看|返回|调用|导出|下载|列出).{0,20}(api[\s_-]?key|secret|token|password|密码|密钥|令牌|数据库凭据|手机号|身份证|银行卡|邮箱|地址|客户名单|员工明细|个人绩效)/i,
    /(api[\s_-]?key|secret|token|password|密码|密钥|令牌|数据库凭据|手机号|身份证|银行卡|邮箱|地址|客户名单|员工明细|个人绩效).{0,20}(是什么|在哪里|给我|发给我|导出|下载|列出)/i,
  ];
  if (
    sensitiveValuePatterns.some((pattern) => pattern.test(question)) ||
    sensitiveRequestPatterns.some((pattern) => pattern.test(question))
  ) {
    return "sensitive_request";
  }

  return null;
}

function parseModelDecision(response: string | null): GovernanceResult | null {
  if (!response) return null;
  const parsed = extractJsonObject(response);
  if (!parsed) return null;

  const decision = parsed.decision;
  const category = parsed.category;
  const reason =
    typeof parsed.reason === "string" ? parsed.reason : "Model classification";

  if (decision === "allow" && category === "allowed") {
    return {
      decision: "allow",
      category: "allowed",
      reason,
      handoff: { sessionId: "", question: "" },
    };
  }

  if (
    decision === "reject" &&
    (category === "prompt_injection" ||
      category === "sensitive_request" ||
      category === "out_of_scope")
  ) {
    return reject(category, reason);
  }

  return null;
}

function reject(
  category: Exclude<GovernanceCategory, "allowed">,
  reason: string
): GovernanceResult {
  const messages: Record<
    Exclude<GovernanceCategory, "allowed">,
    string
  > = {
    prompt_injection:
      "抱歉，该请求涉及违规输入，LuminaX已拒绝处理，请重新提问。",
    sensitive_request:
      "抱歉，该请求涉及敏感信息，LuminaX已拒绝处理，请重新提问。",
    out_of_scope:
      "抱歉，LuminaX只能回答与门店销售相关的问题，请重新提问。",
    governance_unavailable:
      "抱歉，LuminaX暂时无法完成安全校验，请稍后重试。",
  };
  return {
    decision: "reject",
    category,
    reason,
    userMessage: messages[category],
  };
}

function rememberDecision(
  memory: AgentMemory,
  sessionId: string,
  category: GovernanceCategory
): void {
  memory.remember(sessionId, {
    role: "assistant",
    content: JSON.stringify({
      decision: category === "allowed" ? "allow" : "reject",
      category,
    }),
  });
}
