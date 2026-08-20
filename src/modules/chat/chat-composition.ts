import { createAttributionAgent } from "@/modules/agents/attribution/attribution-agent";
import { customMetricRuntime } from "@/modules/admin/metrics/metric-composition";
import { accessControl } from "@/modules/admin/permissions/permission-composition";
import { NoopAttributionKnowledgeRetriever } from "@/modules/agents/attribution/attribution-rag";
import { createBusinessAgent } from "@/modules/agents/business/business-agent";
import { createGovernanceAgent } from "@/modules/agents/governance/governance-agent";
import { InMemoryAgentMemory } from "@/modules/agents/shared/agent-memory";
import { DeepSeekChatModel } from "@/modules/agents/shared/deepseek-chat-model";
import { createBusinessIntentRouter } from "@/modules/intent/business-intent-router";
import { createChatApplication } from "./chat-application";
import {
  insightApplication,
  metricQueryExecutor,
} from "@/modules/insights/insight-composition";

const defaultModel =
  process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const businessAnswerTimeoutMs = Number(
  process.env.DEEPSEEK_BUSINESS_TIMEOUT_MS || 90_000
);
const intentTimeoutMs = readIntentTimeoutMs();

const governanceAgent = createGovernanceAgent({
  model: new DeepSeekChatModel({
    model: process.env.DEEPSEEK_GOVERNANCE_MODEL || defaultModel,
  }),
  memory: new InMemoryAgentMemory(),
});

const attributionAgent = createAttributionAgent({
  model: new DeepSeekChatModel({
    model: process.env.DEEPSEEK_ATTRIBUTION_MODEL || defaultModel,
  }),
  memory: new InMemoryAgentMemory(),
  knowledgeRetriever: new NoopAttributionKnowledgeRetriever(),
});

const intentRouter = createBusinessIntentRouter({
  model: new DeepSeekChatModel({
    model:
      process.env.DEEPSEEK_INTENT_MODEL ||
      process.env.DEEPSEEK_BUSINESS_MODEL ||
      defaultModel,
    timeoutMs: intentTimeoutMs,
  }),
  onRoute: (event) => console.info("[intent-route]", JSON.stringify(event)),
});

const businessAgent = createBusinessAgent({
  metricQueryExecutor,
  model: new DeepSeekChatModel({
    model: process.env.DEEPSEEK_BUSINESS_MODEL || defaultModel,
    timeoutMs: businessAnswerTimeoutMs,
  }),
  memory: new InMemoryAgentMemory(),
  attributionAgent,
  intentRouter,
  customMetricRuntime,
  accessControl,
});

export const chatApplication = createChatApplication({
  governanceAgent,
  businessAgent,
  insightApplication,
});

function readIntentTimeoutMs(): number {
  const timeout = Number(process.env.DEEPSEEK_INTENT_TIMEOUT_MS || 8_000);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 8_000;
}
