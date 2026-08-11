import {
  BRAND_YELLOW,
  CATEGORY_LABELS,
  CHANNEL_LABELS,
  CHART_PALETTE,
  DAYPART_LABELS,
  STORE_DISPLAY_INFO,
} from "@/modules/domain/constants";
import type { ChartData } from "@/modules/metrics/chart-data";
import {
  aggregateByKey,
  sumBy,
  uniqueSorted,
} from "@/modules/visualization/chart-series-builders";
import {
  createAxisGrid,
  EMPTY_DASHBOARD_CHART_OPTIONS,
  formatCompactNumber,
  type DashboardChartOptions,
} from "@/modules/visualization/chart-theme";

interface BuildDashboardChartOptionsInput {
  chartData: ChartData | null;
  selectedStore: string;
  compareStores: string[];
}

export function buildDashboardChartOptions({
  chartData,
  selectedStore,
  compareStores,
}: BuildDashboardChartOptionsInput): DashboardChartOptions {
  if (!chartData) return EMPTY_DASHBOARD_CHART_OPTIONS;

  return {
    salesTrend: buildSalesTrendOption(chartData, selectedStore, compareStores),
    channel: buildChannelOption(chartData, compareStores),
    category: buildCategoryOption(chartData, compareStores),
    daypart: buildDaypartOption(chartData, compareStores),
    refund: buildRefundOption(chartData),
  };
}

function buildSalesTrendOption(
  chartData: ChartData,
  selectedStore: string,
  compareStores: string[]
) {
  const dates = uniqueSorted(chartData.salesDaily.map((item) => item.date));
  const displayStores =
    compareStores.length > 1
      ? compareStores
      : selectedStore === "all"
        ? uniqueSorted(chartData.salesDaily.map((item) => item.store_id))
        : [selectedStore];

  const baseOption = {
    tooltip: { trigger: "axis" as const },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: createAxisGrid(),
    xAxis: {
      type: "category" as const,
      data: dates.map((date) => date.slice(5)),
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: "value" as const,
      name: "元",
      axisLabel: {
        fontSize: 11,
        formatter: (value: number) =>
          value >= 10000 ? `${(value / 10000).toFixed(0)}万` : String(value),
      },
    },
  };

  if (displayStores.length === 1) {
    const storeId = displayStores[0];
    const salesData = dates.map((date) => {
      const item = chartData.salesDaily.find(
        (sales) => sales.date === date && sales.store_id === storeId
      );
      return item?.actual_sales || 0;
    });
    const targetData = dates.map((date) => {
      const item = chartData.targetsDaily.find(
        (target) => target.date === date && target.store_id === storeId
      );
      return item?.sales_target || 0;
    });

    return {
      ...baseOption,
      series: [
        {
          name: "实际销售额",
          type: "line",
          data: salesData,
          smooth: true,
          itemStyle: { color: BRAND_YELLOW },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(255,230,0,0.4)" },
                { offset: 1, color: "rgba(255,230,0,0.05)" },
              ],
            },
          },
        },
        {
          name: "销售目标",
          type: "line",
          data: targetData,
          lineStyle: { type: "dashed" as const, color: "#c62828" },
          itemStyle: { color: "#c62828" },
        },
      ],
    };
  }

  return {
    ...baseOption,
    series: displayStores.map((storeId, index) => ({
      name: STORE_DISPLAY_INFO[storeId]?.name || storeId,
      type: "line" as const,
      data: dates.map((date) => {
        const item = chartData.salesDaily.find(
          (sales) => sales.date === date && sales.store_id === storeId
        );
        return item?.actual_sales || 0;
      }),
      smooth: true,
      itemStyle: { color: CHART_PALETTE[index % CHART_PALETTE.length] },
    })),
  };
}

function buildChannelOption(chartData: ChartData, compareStores: string[]) {
  return buildMixOption({
    compareStores,
    rows: chartData.channel,
    getDimension: (item) => item.channel,
    valueLabel: "元",
    labels: CHANNEL_LABELS,
  });
}

function buildCategoryOption(chartData: ChartData, compareStores: string[]) {
  return buildMixOption({
    compareStores,
    rows: chartData.category,
    getDimension: (item) => item.category,
    valueLabel: "元",
    labels: CATEGORY_LABELS,
  });
}

function buildDaypartOption(chartData: ChartData, compareStores: string[]) {
  return buildMixOption({
    compareStores,
    rows: chartData.daypart,
    getDimension: (item) => item.daypart,
    valueLabel: "元",
    labels: DAYPART_LABELS,
  });
}

type MixRow = {
  store_id: string;
  sales_amount: number;
};

function buildMixOption<TItem extends MixRow>({
  compareStores,
  rows,
  getDimension,
  valueLabel,
  labels,
}: {
  compareStores: string[];
  rows: TItem[];
  getDimension: (item: TItem) => string;
  valueLabel: string;
  labels: Record<string, string>;
}) {
  if (compareStores.length > 1) {
    const dimensions = uniqueSorted(rows.map(getDimension));
    return {
      tooltip: { trigger: "axis" as const },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      grid: createAxisGrid(),
      xAxis: {
        type: "category" as const,
        data: dimensions.map((value) => labels[value] || value),
      },
      yAxis: { type: "value" as const, name: valueLabel },
      series: compareStores.map((storeId, index) => ({
        name: STORE_DISPLAY_INFO[storeId]?.name || storeId,
        type: "bar" as const,
        data: dimensions.map((value) =>
          sumBy(
            rows.filter(
              (item) =>
                item.store_id === storeId && getDimension(item) === value
            ),
            (item) => item.sales_amount
          )
        ),
        itemStyle: { color: CHART_PALETTE[index % CHART_PALETTE.length] },
      })),
    };
  }

  const totals = aggregateByKey(
    rows,
    getDimension,
    (item) => item.sales_amount
  );
  const data = Object.entries(totals).map(([name, value]) => ({
    name: labels[name] || name,
    value,
  }));

  return {
    tooltip: {
      trigger: "item" as const,
      formatter: (params: { name: string; value: number; percent: number }) =>
        `${params.name}: ¥${formatCompactNumber(params.value)} (${params.percent}%)`,
    },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [
      {
        type: "pie",
        radius: ["40%", "70%"],
        center: ["50%", "45%"],
        data,
        label: {
          formatter: (params: { name: string; percent: number }) =>
            `${params.name}\n${params.percent}%`,
        },
        itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
      },
    ],
    color: CHART_PALETTE,
  };
}

function buildRefundOption(chartData: ChartData) {
  const dates = uniqueSorted(chartData.refund.map((item) => item.date));
  const refundData = dates.map((date) =>
    sumBy(
      chartData.refund.filter((item) => item.date === date),
      (item) => item.refund_amount
    )
  );
  const cancelData = dates.map((date) =>
    sumBy(
      chartData.refund.filter((item) => item.date === date),
      (item) => item.cancelled_orders
    )
  );

  return {
    tooltip: { trigger: "axis" as const },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: createAxisGrid(),
    xAxis: {
      type: "category" as const,
      data: dates.map((date) => date.slice(5)),
      axisLabel: { fontSize: 11 },
    },
    yAxis: [
      { type: "value" as const, name: "退款(元)", position: "left" },
      { type: "value" as const, name: "取消订单", position: "right" },
    ],
    series: [
      {
        name: "退款金额",
        type: "bar",
        data: refundData,
        itemStyle: { color: "#c62828" },
      },
      {
        name: "取消订单",
        type: "line",
        yAxisIndex: 1,
        data: cancelData,
        smooth: true,
        itemStyle: { color: "#f57c00" },
      },
    ],
  };
}
