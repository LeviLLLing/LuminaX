import { createMetricSqlAuthoringAgent } from "@/modules/agents/metric-authoring/metric-sql-authoring-agent";
import { DeepSeekChatModel } from "@/modules/agents/shared/deepseek-chat-model";
import { readDatabaseConfig } from "@/modules/data-source/data-source-factory";
import { RegisteredCustomMetricRuntime } from "./custom-metric-runtime";
import { createMetricAdminApplication } from "./metric-admin-application";
import { FileMetricDefinitionRepository } from "./metric-definition-repository";
import { MySqlMetricQueryRunner } from "./metric-query-runner";

const defaultModel = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const metricRepository = new FileMetricDefinitionRepository();
const metricQueryRunner = new MySqlMetricQueryRunner(
  readDatabaseConfig("MYSQL")
);
const metricSqlAuthoringAgent = createMetricSqlAuthoringAgent(
  new DeepSeekChatModel({
    model: process.env.DEEPSEEK_METRIC_AUTHORING_MODEL || defaultModel,
    timeoutMs: readMetricAuthoringTimeout(),
  })
);

export const metricAdminApplication = createMetricAdminApplication(
  metricRepository,
  metricQueryRunner,
  metricSqlAuthoringAgent
);

export const customMetricRuntime = new RegisteredCustomMetricRuntime(
  metricRepository,
  metricQueryRunner
);

function readMetricAuthoringTimeout(): number {
  const timeout = Number(
    process.env.DEEPSEEK_METRIC_AUTHORING_TIMEOUT_MS || 60_000
  );
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 60_000;
}
