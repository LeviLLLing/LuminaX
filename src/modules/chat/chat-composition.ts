import { createAttributionAgent } from "@/modules/agents/attribution/attribution-agent";
import { customMetricRuntime } from "@/modules/admin/metrics/metric-composition";
import { accessControl } from "@/modules/admin/permissions/permission-composition";
import { NoopAttributionKnowledgeRetriever } from "@/modules/agents/attribution/attribution-rag";
import { createBusinessAgent } from "@/modules/agents/business/business-agent";
import { createGovernanceAgent } from "@/modules/agents/governance/governance-agent";
import { InMemoryAgentMemory } from "@/modules/agents/shared/agent-memory";
import { DeepSeekChatModel } from "@/modules/agents/shared/deepseek-chat-model";
import { createChatApplication } from "./chat-application";
import {
  insightApplication,
  metricQueryExecutor,
} from "@/modules/insights/insight-composition";

const defaultModel =
  process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

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

const businessAgent = createBusinessAgent({
  metricQueryExecutor,
  model: new DeepSeekChatModel({
    model: process.env.DEEPSEEK_BUSINESS_MODEL || defaultModel,
  }),
  memory: new InMemoryAgentMemory(),
  attributionAgent,
  customMetricRuntime,
  accessControl,
});

export const chatApplication = createChatApplication({
  governanceAgent,
  businessAgent,
  insightApplication,
});
