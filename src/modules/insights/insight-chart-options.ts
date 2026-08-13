import type { EChartsOption } from "echarts";
import type { InsightEvidence, InsightEvidenceSeries } from "./insight-types";

const COLORS = {
  positive: "#16794f",
  negative: "#c53b32",
  neutral: "#6b7280",
  baseline: "#17181a",
  grid: "#dedfe2",
} as const;

const HORIZONTAL_TYPES = new Set<InsightEvidence["type"]>([
  "store_target_variance",
  "channel_contribution",
  "category_contribution",
  "daypart_contribution",
  "metric_drivers",
]);

export function buildInsightEvidenceChartOption(evidence: InsightEvidence): EChartsOption {
  return HORIZONTAL_TYPES.has(evidence.type)
    ? buildHorizontalOption(evidence)
    : buildTimelineOption(evidence);
}

function buildHorizontalOption(evidence: InsightEvidence): EChartsOption {
  const rows = [...evidence.series].sort(
    (left, right) => Math.abs(right.value) - Math.abs(left.value) || left.key.localeCompare(right.key)
  );
  return {
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 96, right: 56, top: 16, bottom: 28, containLabel: true },
    xAxis: { type: "value", splitLine: { lineStyle: { color: COLORS.grid } } },
    yAxis: { type: "category", data: rows.map((row) => row.label), axisTick: { show: false } },
    series: [{
      type: "bar",
      data: rows.map(dataItem),
      label: { show: true, position: "right", formatter: `{c}${evidence.unit}` },
      markLine: baselineMarkLine(rows, evidence.baselineLabel, "xAxis"),
    }],
  };
}

function buildTimelineOption(evidence: InsightEvidence): EChartsOption {
  const rows = [...evidence.series].sort((left, right) => left.key.localeCompare(right.key));
  return {
    animation: false,
    tooltip: { trigger: "axis" },
    grid: { left: 96, right: 56, top: 16, bottom: 48, containLabel: true },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      axisLabel: { interval: 0 },
    },
    yAxis: { type: "value", splitLine: { lineStyle: { color: COLORS.grid } } },
    series: [{
      type: evidence.type === "anomaly_dates" ? "line" : "bar",
      data: rows.map(dataItem),
      label: { show: true, position: "top", formatter: `{c}${evidence.unit}` },
      lineStyle: evidence.type === "anomaly_dates" ? { color: COLORS.neutral } : undefined,
      markLine: baselineMarkLine(rows, evidence.baselineLabel, "yAxis"),
    }],
  };
}

function dataItem(row: InsightEvidenceSeries) {
  return { value: row.value, itemStyle: { color: COLORS[row.direction] } };
}

function baselineMarkLine(
  rows: InsightEvidenceSeries[],
  label: string,
  axis: "xAxis" | "yAxis"
) {
  const baselines = rows
    .map((row) => row.baseline)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (baselines.length === 0) return undefined;
  return {
    silent: true,
    symbol: "none",
    lineStyle: { type: "dashed" as const, color: COLORS.baseline },
    label: { show: true, formatter: label },
    data: [{ [axis]: baselines[0] }],
  };
}
