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
