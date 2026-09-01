export type ChartOption = Record<string, unknown>;

export interface DashboardChartOptions {
  salesTrend: ChartOption;
  channel: ChartOption;
  category: ChartOption;
  daypart: ChartOption;
  refund: ChartOption;
}

export const EMPTY_DASHBOARD_CHART_OPTIONS: DashboardChartOptions = {
  salesTrend: {},
  channel: {},
  category: {},
  daypart: {},
  refund: {},
};

export const LUMINAX_CHART_COLORS = Object.freeze({
  primary: "#2563A6",
  accent: "#C4AF00",
  positive: "#168354",
  risk: "#C53B32",
  neutral: "#676C75",
  series: ["#2563A6", "#168354", "#C53B32", "#C4AF00", "#0E7490"],
});

export function createChartTextStyle() {
  return { color: "#676C75", fontFamily: "inherit", fontSize: 11 };
}

export function formatCompactNumber(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return value.toLocaleString();
}

export function createAxisGrid() {
  return {
    left: "3%",
    right: "4%",
    bottom: "15%",
    top: "10%",
    containLabel: true,
  };
}
