import { Parser, type Select } from "node-sql-parser";
import type { CustomMetricDefinition } from "@/modules/admin/metrics/metric-definition";
import type { SqlMetricIntent } from "@/modules/metrics/sql-metric-query-executor";
import {
  findPermissionTable,
  type PermissionTableName,
} from "./permission-data-catalog";
import type { DataAccessRequirement } from "./permission-types";

const parser = new Parser();

const master = requirement("store_master", ["store_id", "store_name"]);
const sales = requirement("store_sales_daily", [
  "store_id",
  "date",
  "actual_sales",
  "order_count",
]);
const target = requirement("sales_target_daily", [
  "store_id",
  "date",
  "sales_target",
]);
const refund = requirement("refund_cancel_daily", [
  "store_id",
  "date",
  "refund_amount",
  "cancelled_orders",
]);
const channel = requirement("sales_by_channel", [
  "store_id",
  "date",
  "channel",
  "sales_amount",
  "order_count",
]);
const category = requirement("sales_by_category", [
  "store_id",
  "date",
  "category",
  "sales_amount",
]);
const daypart = requirement("sales_by_daypart", [
  "store_id",
  "date",
  "daypart",
  "sales_amount",
]);
const promotion = requirement("promotion_daily", [
  "store_id",
  "date",
  "promotion_name",
  "promo_sales",
  "promo_orders",
]);
const feedback = requirement("store_manager_feedback", [
  "store_id",
  "date",
  "feedback_type",
  "feedback_detail",
  "affected_daypart",
  "affected_channel",
  "manager_name",
]);

export const FIXED_METRIC_ACCESS_REQUIREMENTS: Record<
  SqlMetricIntent,
  DataAccessRequirement[]
> = {
  achievement_rate: [master, sales, target],
  order_trend: [
    master,
    requirement("store_sales_daily", ["store_id", "date", "order_count"]),
    requirement("sales_target_daily", ["store_id", "date", "order_target"]),
  ],
  aov_trend: [
    master,
    sales,
    requirement("sales_target_daily", ["store_id", "date", "aov_target"]),
  ],
  channel_mix: [master, channel],
  daypart_analysis: [master, daypart],
  promotion_contribution: [master, sales, promotion],
  refund_rate: [master, sales, refund],
  anomaly_detection: [
    master,
    requirement("store_sales_daily", [
      "store_id",
      "date",
      "actual_sales",
      "order_count",
      "avg_order_value",
      "refund_amount",
    ]),
    target,
    refund,
  ],
  compare: [master, sales, target, refund, channel, category, daypart, feedback],
  attribution: [
    master,
    sales,
    target,
    refund,
    channel,
    category,
    daypart,
    feedback,
    promotion,
  ],
  report: [master, sales, target, refund, promotion, channel, category, daypart],
};

export function getCustomMetricAccessRequirements(
  metric: CustomMetricDefinition
): DataAccessRequirement[] {
  try {
    const parsed = parser.parse(toParserSql(metric.sqlTemplate), {
      database: "MySQL",
    });
    if (Array.isArray(parsed.ast) || parsed.ast.type !== "select") {
      return requireAllColumns(metric.requestedTables);
    }

    const select = parsed.ast as Select;
    const cteNames = collectCteNames(select);
    const tables = [...new Set(
      parsed.tableList
        .map(extractReferenceName)
        .filter((table) => !cteNames.has(table))
        .filter((table): table is PermissionTableName => Boolean(findPermissionTable(table)))
    )];
    const columnsByTable = new Map<string, Set<string>>(
      tables.map((table) => [table, new Set<string>()])
    );

    for (const reference of parsed.columnList) {
      const parts = reference.split("::");
      const tableName = parts.at(-2)?.replace(/`/g, "").toLowerCase() || "";
      const columnName = parts.at(-1)?.replace(/`/g, "").toLowerCase() || "";
      if (!columnName || cteNames.has(tableName)) continue;

      if (columnsByTable.has(tableName)) {
        addColumn(columnsByTable, tableName, columnName);
        continue;
      }

      for (const table of tables) {
        const catalog = findPermissionTable(table);
        if (columnName === "*" || catalog?.columns.includes(columnName as never)) {
          addColumn(columnsByTable, table, columnName);
        }
      }
    }

    return tables.map((tableName) => {
      const catalog = findPermissionTable(tableName);
      const columns = [...(columnsByTable.get(tableName) || [])];
      return {
        tableName,
        columns: columns.includes("*")
          ? [...(catalog?.columns || [])]
          : columns,
      };
    });
  } catch {
    return requireAllColumns(metric.requestedTables);
  }
}

function requirement(
  tableName: PermissionTableName,
  columns: string[]
): DataAccessRequirement {
  return { tableName, columns };
}

function requireAllColumns(tables: readonly string[]): DataAccessRequirement[] {
  return tables.flatMap((tableName) => {
    const table = findPermissionTable(tableName);
    return table
      ? [{ tableName, columns: [...table.columns] }]
      : [];
  });
}

function addColumn(
  columnsByTable: Map<string, Set<string>>,
  tableName: string,
  columnName: string
): void {
  columnsByTable.get(tableName)?.add(columnName);
}

function toParserSql(sqlTemplate: string): string {
  return sqlTemplate.replace(
    /\{\{(store_ids|start_date|end_date)\}\}/g,
    (_, marker: string) =>
      marker === "store_ids" ? "'KFC001'" : "'2025-05-01'"
  );
}

function extractReferenceName(reference: string): string {
  return reference.split("::").at(-1)?.replace(/`/g, "").toLowerCase() || "";
}

function collectCteNames(select: Select, names = new Set<string>()): Set<string> {
  for (const withItem of select.with || []) {
    names.add(withItem.name.value.toLowerCase());
    collectCteNames(withItem.stmt.ast, names);
  }
  if (select._next) collectCteNames(select._next, names);
  return names;
}

