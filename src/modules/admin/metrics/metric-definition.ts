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

export const METRIC_INSIGHT_DIRECTIONS = [
  "higher_is_better",
  "lower_is_better",
  "target_is_best",
  "neutral",
] as const;

export const METRIC_INSIGHT_BENCHMARKS = [
  "absolute",
  "target",
  "scoped_average",
  "none",
] as const;

export type MetricCategory = (typeof METRIC_CATEGORIES)[number];
export type MetricUnit = (typeof METRIC_UNITS)[number];
export type MetricSourceTable = (typeof METRIC_SOURCE_TABLES)[number];
export type MetricInsightDirection = (typeof METRIC_INSIGHT_DIRECTIONS)[number];
export type MetricInsightBenchmark = (typeof METRIC_INSIGHT_BENCHMARKS)[number];
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
  insightPolicy?: MetricInsightPolicy | null;
}

export interface MetricInsightPolicy {
  direction: MetricInsightDirection;
  benchmark: MetricInsightBenchmark;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  targetValue: number | null;
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

export function normalizeMetricInsightPolicy(
  policy: MetricInsightPolicy | null | undefined
): MetricInsightPolicy | null {
  if (policy == null) return null;
  if (!METRIC_INSIGHT_DIRECTIONS.includes(policy.direction)) {
    throw new Error("洞察判断方向无效。");
  }
  if (!METRIC_INSIGHT_BENCHMARKS.includes(policy.benchmark)) {
    throw new Error("洞察比较基准无效。");
  }

  const numericValues = [
    policy.warningThreshold,
    policy.criticalThreshold,
    policy.targetValue,
  ];
  if (numericValues.some((value) => value !== null && !Number.isFinite(value))) {
    throw new Error("洞察判断阈值必须是有限数值。");
  }
  if (policy.direction === "neutral" && policy.benchmark !== "none") {
    throw new Error("中性指标只能使用无基准判断。");
  }
  if (policy.direction !== "neutral" && policy.benchmark === "none") {
    throw new Error("非中性指标必须选择比较基准。");
  }
  if (
    (policy.direction === "target_is_best" || policy.benchmark === "target") &&
    policy.targetValue === null
  ) {
    throw new Error("目标模式必须填写目标值。");
  }

  const usesDeviation =
    policy.direction === "target_is_best" ||
    policy.benchmark === "target" ||
    policy.benchmark === "scoped_average";
  if (
    usesDeviation &&
    numericValues.slice(0, 2).some((value) => value !== null && value < 0)
  ) {
    throw new Error("偏离阈值不能为负数。");
  }

  const warning = policy.warningThreshold;
  const critical = policy.criticalThreshold;
  if (warning !== null && critical !== null && policy.direction !== "neutral") {
    const criticalMustBeLower =
      policy.benchmark === "absolute" &&
      policy.direction === "higher_is_better";
    const invalidOrder = criticalMustBeLower
      ? critical >= warning
      : critical <= warning;
    if (invalidOrder) {
      throw new Error("严重阈值必须比警戒阈值更深入风险区间。");
    }
  }

  return {
    direction: policy.direction,
    benchmark: policy.benchmark,
    warningThreshold: policy.warningThreshold,
    criticalThreshold: policy.criticalThreshold,
    targetValue: policy.targetValue,
  };
}
