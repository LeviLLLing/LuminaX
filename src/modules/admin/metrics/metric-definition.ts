export const METRIC_CATEGORIES = [
  "sales",
  "order",
  "customer",
  "channel",
  "promotion",
  "risk",
  "operations",
] as const;

export const METRIC_UNITS = [
  "number",
  "currency",
  "percentage",
  "count",
] as const;

export const METRIC_SOURCE_TABLES = [
  "store_sales_daily",
  "sales_target_daily",
  "sales_by_channel",
  "sales_by_daypart",
  "sales_by_category",
  "promotion_daily",
  "refund_cancel_daily",
  "store_manager_feedback",
  "store_master",
  "store_sales_attribution_dataset",
] as const;

export type MetricCategory = (typeof METRIC_CATEGORIES)[number];
export type MetricUnit = (typeof METRIC_UNITS)[number];
export type MetricSourceTable = (typeof METRIC_SOURCE_TABLES)[number];
export type CustomMetricStatus =
  | "draft"
  | "validated"
  | "published"
  | "disabled";

export interface MetricSqlValidation {
  valid: boolean;
  errors: string[];
  tables: string[];
  outputColumns: string[];
}

export interface MetricValidationSnapshot {
  validatedAt: string;
  tables: string[];
  outputColumns: string[];
  sampleRowCount: number;
}

export interface MetricDefinitionInput {
  id?: string;
  code: string;
  name: string;
  description: string;
  aliases: string[];
  category: MetricCategory;
  unit: MetricUnit;
  precision: number;
  requestedTables: MetricSourceTable[];
  sqlTemplate: string;
}

export interface CustomMetricDefinition extends MetricDefinitionInput {
  id: string;
  origin: "custom";
  status: CustomMetricStatus;
  validation: MetricValidationSnapshot | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface SystemMetricDefinition {
  id: string;
  code: string;
  name: string;
  description: string;
  aliases: string[];
  category: MetricCategory;
  unit: MetricUnit;
  precision: number;
  requestedTables: MetricSourceTable[];
  sqlTemplate: "";
  origin: "system";
  status: "system";
  validation: null;
  createdAt: null;
  updatedAt: null;
  publishedAt: null;
}

export type RegisteredMetricDefinition =
  | SystemMetricDefinition
  | CustomMetricDefinition;

export interface MetricQueryScope {
  storeIds: string[];
  startDate: string;
  endDate: string;
}

export interface MetricQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  columns: string[];
}

export interface MetricSqlDraft {
  sqlTemplate: string;
  explanation: string;
  assumptions: string[];
  validation: MetricSqlValidation;
}
