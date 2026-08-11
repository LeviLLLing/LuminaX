import {
  type DatabaseConnectionConfig,
  type SalesDataSource,
  type SalesDataSourceKind,
} from "@/modules/data-source/data-source";
import { JsonSalesDataSource } from "@/modules/data-source/json-sales-data-source";
import { MySqlSalesDataSource } from "@/modules/data-source/mysql-sales-data-source";
import { SqlServerSalesDataSource } from "@/modules/data-source/sqlserver-sales-data-source";

export function createSalesDataSource(
  kind: SalesDataSourceKind = readDataSourceKind()
): SalesDataSource {
  switch (kind) {
    case "mysql":
      return new MySqlSalesDataSource(readDatabaseConfig("MYSQL"));
    case "sqlserver":
      return new SqlServerSalesDataSource(readDatabaseConfig("SQLSERVER"));
    case "json":
    default:
      return new JsonSalesDataSource();
  }
}

function readDataSourceKind(): SalesDataSourceKind {
  const value = process.env.LUMINAX_DATA_SOURCE?.toLowerCase();
  if (value === "mysql" || value === "sqlserver") return value;
  return "json";
}

export function readDatabaseConfig(
  prefix: "MYSQL" | "SQLSERVER"
): DatabaseConnectionConfig {
  return {
    host: process.env[`${prefix}_HOST`] || "localhost",
    port: parseOptionalPort(process.env[`${prefix}_PORT`]),
    database: process.env[`${prefix}_DATABASE`] || "LuminaX",
    username: process.env[`${prefix}_USERNAME`] || "",
    password: process.env[`${prefix}_PASSWORD`] || "",
  };
}

function parseOptionalPort(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const port = Number(value);
  return Number.isFinite(port) ? port : undefined;
}
