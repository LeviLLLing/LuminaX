import { readFileSync } from "node:fs";
import { createPool, type Pool, type PoolOptions } from "mysql2/promise";
import type { DatabaseConnectionConfig } from "./data-source";

export function createMySqlPool(
  config: DatabaseConnectionConfig
): Pool {
  return createPool({
    host: config.host,
    port: config.port || 3306,
    database: config.database,
    user: config.username,
    password: config.password,
    waitForConnections: true,
    connectionLimit: readPositiveNumber(
      process.env.MYSQL_CONNECTION_LIMIT,
      2
    ),
    connectTimeout: readPositiveNumber(
      process.env.MYSQL_CONNECT_TIMEOUT_MS,
      10_000
    ),
    charset: "utf8mb4_0900_ai_ci",
    dateStrings: true,
    decimalNumbers: true,
    ssl: createSslOptions(),
  });
}

export function readMySqlQueryTimeout(): number {
  return readPositiveNumber(
    process.env.MYSQL_QUERY_TIMEOUT_MS,
    10_000
  );
}

function createSslOptions(): PoolOptions["ssl"] {
  if (!readBoolean(process.env.MYSQL_SSL, false)) return undefined;

  const caPath = process.env.MYSQL_SSL_CA?.trim();
  return {
    ca: caPath ? readFileSync(caPath, "utf8") : undefined,
    rejectUnauthorized: readBoolean(
      process.env.MYSQL_SSL_REJECT_UNAUTHORIZED,
      Boolean(caPath)
    ),
  };
}

function readPositiveNumber(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.toLowerCase() === "true";
}
