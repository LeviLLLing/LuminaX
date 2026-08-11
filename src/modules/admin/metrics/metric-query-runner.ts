import type { Pool, QueryOptions, RowDataPacket } from "mysql2/promise";
import type { DatabaseConnectionConfig } from "@/modules/data-source/data-source";
import {
  createMySqlPool,
  readMySqlQueryTimeout,
} from "@/modules/data-source/mysql-pool";
import { normalizeExternalStoreRecord } from "@/modules/domain/store-identity";
import type {
  MetricQueryResult,
  MetricQueryScope,
} from "./metric-definition";
import {
  compileMetricSqlTemplate,
  validateMetricSqlTemplate,
} from "./metric-sql-template";

export interface MetricQueryRunner {
  run(sqlTemplate: string, scope: MetricQueryScope): Promise<MetricQueryResult>;
}

export class MySqlMetricQueryRunner implements MetricQueryRunner {
  private readonly pool: Pool;
  private readonly queryTimeoutMs: number;

  constructor(config: DatabaseConnectionConfig) {
    this.pool = createMySqlPool(config);
    this.queryTimeoutMs = readMySqlQueryTimeout();
  }

  async run(
    sqlTemplate: string,
    scope: MetricQueryScope
  ): Promise<MetricQueryResult> {
    const validation = validateMetricSqlTemplate(sqlTemplate);
    if (!validation.valid) throw new Error(validation.errors.join(" "));

    const compiled = compileMetricSqlTemplate(sqlTemplate, scope);
    const options: QueryOptions = {
      sql: compiled.sql,
      values: compiled.values,
      timeout: this.queryTimeoutMs,
    };
    const [rows] = await this.pool.query<RowDataPacket[]>(options);
    const normalizedRows = rows.map((row) =>
      normalizeExternalStoreRecord({ ...row }) as Record<string, unknown>
    );
    return {
      rows: normalizedRows,
      rowCount: normalizedRows.length,
      columns: normalizedRows[0] ? Object.keys(normalizedRows[0]) : [],
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
