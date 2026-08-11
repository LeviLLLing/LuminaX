import type { CustomMetricDefinition } from "../../src/modules/admin/metrics/metric-definition";
import type { PermissionUser } from "../../src/modules/admin/permissions/permission-types";

export const SAFE_CUSTOM_METRIC_SQL = `
SELECT ROUND(SUM(actual_sales), 2) AS metric_value
FROM store_sales_daily
WHERE store_id IN ({{store_ids}})
  AND date BETWEEN {{start_date}} AND {{end_date}}
`.trim();

export function createSystemPermissionUser(): PermissionUser {
  return {
    id: "system-admin",
    username: "admin",
    displayName: "系统管理员",
    role: "super_admin",
    status: "active",
    system: true,
    policies: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export function createRestrictedPermissionUser(): PermissionUser {
  return {
    id: "analyst-one",
    username: "analyst.one",
    displayName: "Analyst One",
    role: "analyst",
    status: "active",
    system: false,
    policies: [
      {
        tableName: "store_sales_daily",
        allowedColumns: ["store_id", "date", "actual_sales"],
        allowedStoreIds: ["S001"],
      },
    ],
    createdAt: "2026-08-10T08:00:00.000Z",
    updatedAt: "2026-08-10T08:00:00.000Z",
  };
}

export function createPublishedMetric(): CustomMetricDefinition {
  return {
    id: "custom-metric-id",
    code: "custom_sales_total",
    name: "自定义销售额",
    description: "统计范围内实际销售额合计",
    aliases: ["销售总额"],
    category: "sales",
    unit: "currency",
    precision: 2,
    requestedTables: ["store_sales_daily"],
    sqlTemplate: SAFE_CUSTOM_METRIC_SQL,
    origin: "custom",
    status: "published",
    validation: {
      validatedAt: "2026-08-10T08:00:00.000Z",
      tables: ["store_sales_daily"],
      outputColumns: ["metric_value"],
      sampleRowCount: 1,
    },
    createdAt: "2026-08-10T08:00:00.000Z",
    updatedAt: "2026-08-10T08:00:00.000Z",
    publishedAt: "2026-08-10T08:00:00.000Z",
  };
}
