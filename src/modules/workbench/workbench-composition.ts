import { FileMetricDefinitionRepository } from "@/modules/admin/metrics/metric-definition-repository";
import { permissionRepository } from "@/modules/admin/permissions/permission-composition";
import { readDatabaseConfig } from "@/modules/data-source/data-source-factory";
import { MySqlSqlMetricQueryExecutor } from "@/modules/metrics/sql/mysql-sql-metric-query-executor";
import { createWorkbenchContextApplication } from "./workbench-context-application";

const metricRepository = new FileMetricDefinitionRepository();
const metricQueryExecutor = new MySqlSqlMetricQueryExecutor(
  readDatabaseConfig("MYSQL")
);

export const workbenchContextApplication =
  createWorkbenchContextApplication({
    permissionRepository,
    metricRepository,
    listStoreIds: () => metricQueryExecutor.listStoreIds(),
  });
