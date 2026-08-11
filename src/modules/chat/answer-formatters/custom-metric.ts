import type { CustomMetricExecution } from "@/modules/admin/metrics/custom-metric-runtime";
import type { MetricQueryScope } from "@/modules/admin/metrics/metric-definition";

export function formatCustomMetric(
  execution: CustomMetricExecution,
  scope: MetricQueryScope
): string {
  const { metric, result } = execution;
  if (result.rowCount === 0) return `*${metric.name}在当前范围内没有可用数据。*`;

  const columns = result.columns.slice(0, 8);
  const rows = result.rows.slice(0, 20);
  const table = [
    `| ${columns.map(formatColumnName).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map(
      (row) =>
        `| ${columns
          .map((column) => formatCell(column, row[column], metric.unit, metric.precision))
          .join(" | ")} |`
    ),
  ].join("\n");

  return [
    `## ${metric.name}`,
    `统计范围：${scope.startDate} 至 ${scope.endDate}，${scope.storeIds.join("、")}`,
    "",
    table,
    "",
    metric.description,
  ].join("\n");
}

function formatColumnName(column: string): string {
  const labels: Record<string, string> = {
    metric_value: "指标值",
    metric_label: "指标",
    store_id: "门店",
    date: "日期",
    dimension_name: "维度",
  };
  return labels[column] || column;
}

function formatCell(
  column: string,
  value: unknown,
  unit: CustomMetricExecution["metric"]["unit"],
  precision: number
): string {
  if (value === null || value === undefined) return "-";
  if (column === "metric_value" && typeof value === "number") {
    const formatted = value.toLocaleString("zh-CN", {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    if (unit === "currency") return `¥${formatted}`;
    if (unit === "percentage") return `${formatted}%`;
    return formatted;
  }
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
