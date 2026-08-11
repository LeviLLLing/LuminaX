import { Parser, type AST, type Select } from "node-sql-parser";
import { toDatabaseStoreId } from "@/modules/domain/store-identity";
import {
  METRIC_SOURCE_TABLES,
  type MetricQueryScope,
  type MetricSqlValidation,
} from "./metric-definition";

const parser = new Parser();
const REQUIRED_MARKERS = [
  "{{store_ids}}",
  "{{start_date}}",
  "{{end_date}}",
] as const;
const MARKER_PATTERN = /\{\{(store_ids|start_date|end_date)\}\}/g;
const FORBIDDEN_FUNCTIONS = [
  "sleep",
  "benchmark",
  "load_file",
  "get_lock",
  "release_lock",
] as const;
const ALLOWED_TABLES = new Set<string>(METRIC_SOURCE_TABLES);

export interface CompiledMetricQuery {
  sql: string;
  values: unknown[];
}

export function validateMetricSqlTemplate(
  sqlTemplate: string
): MetricSqlValidation {
  const sql = sqlTemplate.trim();
  const errors: string[] = [];

  if (!sql) errors.push("SQL 不能为空。");
  if (sql.length > 20_000) errors.push("SQL 长度不能超过 20,000 个字符。");
  for (const marker of REQUIRED_MARKERS) {
    if (!sql.includes(marker)) errors.push(`SQL 缺少范围参数 ${marker}。`);
  }
  if (sql.includes("?")) errors.push("请使用范围参数模板，不要直接使用问号占位符。");
  if (/;/.test(sql)) errors.push("SQL 只能包含一条语句，且不能包含分号。");
  if (/--|#|\/\*/.test(sql)) errors.push("SQL 不能包含注释。");
  if (/\binto\s+(outfile|dumpfile)\b/i.test(sql)) {
    errors.push("SQL 不能写入文件。");
  }
  for (const functionName of FORBIDDEN_FUNCTIONS) {
    if (new RegExp(`\\b${functionName}\\s*\\(`, "i").test(sql)) {
      errors.push(`SQL 不能调用 ${functionName}。`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, tables: [], outputColumns: [] };
  }

  try {
    const parsed = parser.parse(toParserSql(sql), { database: "MySQL" });
    const ast = parsed.ast;
    if (Array.isArray(ast) || ast.type !== "select") {
      errors.push("SQL 必须是单条 SELECT 或 WITH ... SELECT 查询。");
      return { valid: false, errors, tables: [], outputColumns: [] };
    }

    const select = ast as Select;
    if (select.limit) errors.push("SQL 不需要设置 LIMIT，运行时会统一限制返回行数。");

    const cteNames = collectCteNames(select);
    const tables = parsed.tableList
      .map(extractTableName)
      .filter((table) => !cteNames.has(table));
    const unauthorizedTables = tables.filter((table) => !ALLOWED_TABLES.has(table));
    if (unauthorizedTables.length > 0) {
      errors.push(`SQL 引用了未授权数据表：${unauthorizedTables.join("、")}。`);
    }

    const outputColumns = extractOutputColumns(ast);
    if (!outputColumns.includes("metric_value")) {
      errors.push("查询结果必须包含别名为 metric_value 的指标值列。");
    }

    return {
      valid: errors.length === 0,
      errors,
      tables: [...new Set(tables)],
      outputColumns,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [
        `SQL 语法解析失败：${error instanceof Error ? error.message : "未知错误"}`,
      ],
      tables: [],
      outputColumns: [],
    };
  }
}

export function compileMetricSqlTemplate(
  sqlTemplate: string,
  scope: MetricQueryScope
): CompiledMetricQuery {
  if (scope.storeIds.length === 0) throw new Error("至少需要一个门店范围。");
  if (!scope.storeIds.every((storeId) => /^S\d{3}$/.test(storeId))) {
    throw new Error("门店编号必须使用 Sxxx 格式。");
  }
  if (!isIsoDate(scope.startDate) || !isIsoDate(scope.endDate)) {
    throw new Error("日期必须使用 YYYY-MM-DD 格式。");
  }
  if (scope.startDate > scope.endDate) throw new Error("开始日期不能晚于结束日期。");

  const values: unknown[] = [];
  const sql = sqlTemplate.trim().replace(MARKER_PATTERN, (_, marker: string) => {
    if (marker === "store_ids") {
      const storeIds = scope.storeIds.map(toDatabaseStoreId);
      values.push(...storeIds);
      return storeIds.map(() => "?").join(", ");
    }
    const date = marker === "start_date" ? scope.startDate : scope.endDate;
    values.push(date);
    return "?";
  });

  return { sql: `${sql}\nLIMIT 200`, values };
}

function toParserSql(sqlTemplate: string): string {
  return sqlTemplate.replace(MARKER_PATTERN, (_, marker: string) => {
    if (marker === "store_ids") return "'KFC001'";
    return marker === "start_date" ? "'2025-05-01'" : "'2025-05-14'";
  });
}

function extractTableName(reference: string): string {
  return reference.split("::").at(-1)?.replace(/`/g, "").toLowerCase() || "";
}

function extractOutputColumns(ast: AST): string[] {
  const columns = (ast as Select).columns;
  if (!Array.isArray(columns)) return [];
  return columns
    .map((column) => {
      const alias = column.as;
      if (typeof alias === "string") return alias.toLowerCase();
      if (alias && typeof alias === "object" && "value" in alias) {
        return String(alias.value).toLowerCase();
      }
      return "";
    })
    .filter(Boolean);
}

function collectCteNames(select: Select, names = new Set<string>()): Set<string> {
  for (const withItem of select.with || []) {
    names.add(withItem.name.value.toLowerCase());
    collectCteNames(withItem.stmt.ast, names);
  }
  if (select._next) collectCteNames(select._next, names);
  return names;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
