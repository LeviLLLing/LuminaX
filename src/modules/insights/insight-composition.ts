import { accessControl } from "@/modules/admin/permissions/permission-composition";
import { DeepSeekChatModel } from "@/modules/agents/shared/deepseek-chat-model";
import { readDatabaseConfig } from "@/modules/data-source/data-source-factory";
import { MySqlSqlMetricQueryExecutor } from "@/modules/metrics/sql/mysql-sql-metric-query-executor";
import { createInsightApplication } from "./insight-application";
import { createInsightComposer } from "./insight-composer";
import { InsightGenerationGuard } from "./insight-generation-guard";
import { FileLatestInsightRepository } from "./latest-insight-repository";

export const metricQueryExecutor = new MySqlSqlMetricQueryExecutor(
  readDatabaseConfig("MYSQL")
);

const insightComposer = createInsightComposer({
  model: new DeepSeekChatModel({
    model:
      process.env.DEEPSEEK_INSIGHT_MODEL ||
      process.env.DEEPSEEK_MODEL ||
      "deepseek-v4-flash",
  }),
});

export const insightApplication = createInsightApplication({
  repository: new FileLatestInsightRepository(),
  guard: new InsightGenerationGuard(),
  composer: insightComposer,
  accessControl,
  listStoreIds: () => metricQueryExecutor.listStoreIds(),
});
