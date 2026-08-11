import type { AnalysisIntent } from "@/modules/domain/analysis-types";

export type SqlMetricIntent = Exclude<
  AnalysisIntent,
  "irrelevant" | "custom_metric"
>;

export interface SqlMetricScope {
  storeIds: string[];
  startDate: string;
  endDate: string;
}

export interface SqlMetricExecution {
  intent: SqlMetricIntent;
  source: "sql";
  data: Record<string, unknown> | null;
}

export interface SqlMetricQueryExecutor {
  listStoreIds(): Promise<string[]>;
  execute(
    intent: SqlMetricIntent,
    scope: SqlMetricScope
  ): Promise<SqlMetricExecution>;
}

export class SqlMetricQueryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SqlMetricQueryError";
  }
}
