import type { EChartsOption } from "echarts";
import {
  createChartTextStyle,
  LUMINAX_CHART_COLORS,
} from "@/modules/visualization/chart-theme";
import type { InsightEvidence, InsightEvidenceSeries } from "./insight-types";

const COLORS = {
  positive: LUMINAX_CHART_COLORS.positive,
  negative: LUMINAX_CHART_COLORS.risk,
  neutral: LUMINAX_CHART_COLORS.neutral,
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
    textStyle: createChartTextStyle(),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 96, right: 56, top: 16, bottom: 28, containLabel: true },
    xAxis: {
      type: "value",
      axisLabel: createChartTextStyle(),
      splitLine: {
        lineStyle: { color: LUMINAX_CHART_COLORS.neutral, opacity: 0.2 },
      },
    },
    yAxis: { type: "category", data: rows.map((row) => row.label), axisTick: { show: false } },
    series: [
      {
        type: "bar",
        data: rows.map(dataItem),
        label: {
          show: true,
          position: "right",
          formatter: valueFormatter(evidence.unit),
        },
      },
      {
        name: evidence.baselineLabel,
        type: "scatter",
        symbol: "rect",
        symbolSize: [2, 18],
        itemStyle: { color: LUMINAX_CHART_COLORS.neutral },
        data: rows.flatMap((row) =>
          row.baseline === undefined
            ? []
            : [{ value: [row.baseline, row.label] }]
        ),
        label: {
          show: true,
          position: "right",
          formatter: valueFormatter(evidence.unit),
        },
      },
    ],
  };
}

function buildTimelineOption(evidence: InsightEvidence): EChartsOption {
  const rows = [...evidence.series].sort((left, right) => left.key.localeCompare(right.key));
  return {
    animation: false,
    textStyle: createChartTextStyle(),
    tooltip: { trigger: "axis" },
    grid: { left: 96, right: 56, top: 16, bottom: 48, containLabel: true },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      axisLabel: { ...createChartTextStyle(), interval: 0 },
    },
    yAxis: {
      type: "value",
      axisLabel: createChartTextStyle(),
      splitLine: {
        lineStyle: { color: LUMINAX_CHART_COLORS.neutral, opacity: 0.2 },
      },
    },
    series: [
      {
        type: evidence.type === "anomaly_dates" ? "line" : "bar",
        data: rows.map(dataItem),
        label: {
          show: true,
          position: "top",
          formatter: valueFormatter(evidence.unit),
        },
        lineStyle:
          evidence.type === "anomaly_dates"
            ? { color: COLORS.neutral }
            : undefined,
      },
      {
        name: evidence.baselineLabel,
        type: "line",
        data: rows.map((row) => row.baseline ?? null),
        connectNulls: false,
        symbol: "circle",
        symbolSize: 6,
        itemStyle: { color: LUMINAX_CHART_COLORS.neutral },
        lineStyle: {
          type: "dashed",
          color: LUMINAX_CHART_COLORS.neutral,
        },
        label: {
          show: true,
          position: "top",
          formatter: valueFormatter(evidence.unit),
        },
      },
    ],
  };
}

function dataItem(row: InsightEvidenceSeries) {
  return { value: row.value, itemStyle: { color: COLORS[row.direction] } };
}

function valueFormatter(unit: string) {
  return (params: { value: unknown }) => formatInsightValue(
    Array.isArray(params.value) ? params.value[0] : params.value,
    unit
  );
}

export function formatInsightValue(value: unknown, unit: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (unit === "percentage" || unit === "%") {
    return `${formatNumber(value, 1)}%`;
  }
  if (unit === "currency") {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }
  if (unit === "count") {
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
  }
  if (unit === "ratio") return formatNumber(value, 2);
  return unit ? `${formatNumber(value, 2)} ${unit}` : formatNumber(value, 2);
}

function formatNumber(value: number, maximumFractionDigits: number): string {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits,
  }).format(value);
}
