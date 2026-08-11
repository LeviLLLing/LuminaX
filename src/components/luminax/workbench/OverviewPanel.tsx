"use client";

import dynamic from "next/dynamic";
import type { DataSummary } from "@/modules/domain/analysis-types";
import { getVisibleInsightSections } from "@/modules/workbench/workbench-presentation";
import {
  formatCompactNumber,
  type ChartOption,
  type DashboardChartOptions,
} from "@/modules/visualization/chart-theme";
import { cn } from "@/lib/utils";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface OverviewPanelProps {
  availableMetricCodes: string[];
  dataSummary: DataSummary | null;
  chartOptions: DashboardChartOptions;
}

export function OverviewPanel({
  availableMetricCodes,
  dataSummary,
  chartOptions,
}: OverviewPanelProps) {
  const sections = new Set(getVisibleInsightSections(availableMetricCodes));

  if (sections.size === 0) {
    return <EmptyState message="当前账号暂无可展示指标" />;
  }

  if (!dataSummary) {
    return <EmptyState message="当前范围暂无可展示数据" />;
  }

  return (
    <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {sections.has("totalSales") && (
          <KpiCard
            label="总销售额"
            value={`¥${formatCompactNumber(dataSummary.salesSummary.totalSales)}`}
          />
        )}
        {sections.has("achievement") && (
          <KpiCard
            label="目标达成率"
            value={dataSummary.salesSummary.achievementRate}
          />
        )}
        {sections.has("orders") && (
          <KpiCard
            label="订单量"
            value={formatCompactNumber(dataSummary.salesSummary.totalOrders)}
          />
        )}
        {sections.has("aov") && (
          <KpiCard
            label="客单价"
            value={`¥${formatCompactNumber(dataSummary.salesSummary.avgOrderValue)}`}
          />
        )}
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        {sections.has("salesTrend") && (
          <ChartCard
            title="销售趋势"
            option={chartOptions.salesTrend}
            wide
          />
        )}
        {sections.has("channel") && (
          <ChartCard title="渠道销售分布" option={chartOptions.channel} />
        )}
        {sections.has("category") && (
          <ChartCard title="品类销售分布" option={chartOptions.category} />
        )}
        {sections.has("daypart") && (
          <ChartCard title="时段销售分布" option={chartOptions.daypart} />
        )}
        {sections.has("refund") && (
          <ChartCard title="退款趋势" option={chartOptions.refund} />
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="min-w-0 rounded-[8px] border border-[#dedfe2] bg-white p-4">
      <p className="truncate text-xs font-medium text-[#666a73]">{label}</p>
      <p className="mt-2 break-words text-2xl font-semibold text-[#17181a]">{value}</p>
    </article>
  );
}

function ChartCard({
  title,
  option,
  wide = false,
}: {
  title: string;
  option: ChartOption;
  wide?: boolean;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-[8px] border border-[#dedfe2] bg-white p-4",
        wide && "xl:col-span-2"
      )}
    >
      <h3 className="mb-3 text-sm font-semibold text-[#17181a]">{title}</h3>
      <div className="h-[280px] min-w-0">
        <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
      </div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center p-4 sm:p-5">
      <p className="max-w-sm text-center text-sm text-[#666a73]">{message}</p>
    </div>
  );
}
