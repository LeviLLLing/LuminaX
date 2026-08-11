"use client";

import dynamic from "next/dynamic";
import type { DataSummary } from "@/modules/domain/analysis-types";
import type { SalesData } from "@/modules/domain/sales-data";
import {
  BRAND_BLACK,
  BRAND_YELLOW,
} from "@/modules/domain/constants";
import {
  formatCompactNumber,
  type ChartOption,
  type DashboardChartOptions,
} from "@/modules/visualization/chart-theme";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface DashboardPanelProps {
  salesData: SalesData | null;
  dataSummary: DataSummary | null;
  selectedStore: string;
  startDate: string;
  endDate: string;
  compareStores: string[];
  chartOptions: DashboardChartOptions;
  onSelectedStoreChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onCompareStoresChange: (value: string[]) => void;
}

export function DashboardPanel({
  salesData,
  dataSummary,
  selectedStore,
  startDate,
  endDate,
  compareStores,
  chartOptions,
  onSelectedStoreChange,
  onStartDateChange,
  onEndDateChange,
  onCompareStoresChange,
}: DashboardPanelProps) {
  return (
    <div className="w-[68%] overflow-y-auto p-5 border-r border-border">
      <div className="flex items-end gap-4 mb-4 p-4 bg-card rounded-lg border border-border">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">门店</label>
          <select
            value={selectedStore}
            onChange={(event) => {
              onSelectedStoreChange(event.target.value);
              onCompareStoresChange([]);
            }}
            className="h-9 px-3 text-sm border border-border rounded-md bg-background"
          >
            <option value="all">全部门店</option>
            {salesData?.store_master.map((store) => (
              <option key={store.store_id} value={store.store_id}>
                {store.store_id} - {store.store_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">起始日期</label>
          <input
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            className="h-9 px-3 text-sm border border-border rounded-md bg-background"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">截止日期</label>
          <input
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            className="h-9 px-3 text-sm border border-border rounded-md bg-background"
          />
        </div>
        {compareStores.length > 1 && (
          <div
            className="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium"
            style={{ backgroundColor: BRAND_YELLOW, color: BRAND_BLACK }}
          >
            对比模式: {compareStores.join(" vs ")}
            <button
              onClick={() => onCompareStoresChange([])}
              className="ml-1 opacity-60 hover:opacity-100"
              type="button"
            >
              退出
            </button>
          </div>
        )}
      </div>

      {dataSummary && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <KpiCard
            dark
            label="总销售额"
            value={`¥${formatCompactNumber(dataSummary.salesSummary.totalSales)}`}
          />
          <KpiCard
            label="目标达成率"
            value={dataSummary.salesSummary.achievementRate}
          />
          <KpiCard
            label="订单量"
            value={formatCompactNumber(dataSummary.salesSummary.totalOrders)}
          />
          <KpiCard
            label="客单价"
            value={`¥${dataSummary.salesSummary.avgOrderValue}`}
          />
        </div>
      )}

      <ChartCard title="销售趋势" option={chartOptions.salesTrend} />

      <div className="grid grid-cols-2 gap-4 mb-4">
        <ChartCard title="渠道销售分布" option={chartOptions.channel} />
        <ChartCard title="品类销售分布" option={chartOptions.category} />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <ChartCard title="时段销售分布" option={chartOptions.daypart} />
        <ChartCard title="退款趋势" option={chartOptions.refund} />
      </div>
    </div>
  );
}

function KpiCard({
  dark = false,
  label,
  value,
}: {
  dark?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div
      className="p-4 rounded-lg border-t-4 bg-card"
      style={
        dark
          ? { backgroundColor: BRAND_BLACK, borderColor: BRAND_YELLOW }
          : { borderColor: BRAND_YELLOW }
      }
    >
      <div
        className="text-2xl font-bold"
        style={dark ? { color: BRAND_YELLOW } : undefined}
      >
        {value}
      </div>
      <div
        className="text-xs mt-1 uppercase tracking-wide"
        style={dark ? { color: "rgba(255,230,0,0.6)" } : undefined}
      >
        {label}
      </div>
    </div>
  );
}

function ChartCard({ title, option }: { title: string; option: ChartOption }) {
  return (
    <div className="p-4 bg-card rounded-lg border border-border mb-4 shadow-sm">
      <h3
        className="text-sm font-semibold text-foreground mb-3 pb-2 border-b-2"
        style={{ borderColor: BRAND_YELLOW }}
      >
        {title}
      </h3>
      <div className="h-[280px]">
        <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
      </div>
    </div>
  );
}
