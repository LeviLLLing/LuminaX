"use client";

import dynamic from "next/dynamic";
import type { DataSummary } from "@/modules/domain/analysis-types";
import {
  getOrderedInsightSections,
  type InsightSectionId,
  type WorkbenchPresentationProfile,
} from "@/modules/workbench/workbench-presentation";
import {
  formatCompactNumber,
  type ChartOption,
  type DashboardChartOptions,
} from "@/modules/visualization/chart-theme";
import { cn } from "@/lib/utils";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface OverviewPanelProps {
  profile: WorkbenchPresentationProfile;
  availableMetricCodes: string[];
  dataSummary: DataSummary | null;
  chartOptions: DashboardChartOptions;
}

export function OverviewPanel({
  profile,
  availableMetricCodes,
  dataSummary,
  chartOptions,
}: OverviewPanelProps) {
  const sections = getOrderedInsightSections(availableMetricCodes, profile);

  if (sections.length === 0) {
    return <EmptyState message="当前账号暂无可展示指标" />;
  }

  if (!dataSummary) {
    return <EmptyState message="当前范围暂无可展示数据" />;
  }

  return (
    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-2 content-start gap-4 overflow-y-auto p-4 sm:p-5 xl:grid-cols-4">
      {sections.map((section) =>
        renderSection(section, dataSummary, chartOptions)
      )}
    </div>
  );
}

function renderSection(
  section: InsightSectionId,
  dataSummary: DataSummary,
  chartOptions: DashboardChartOptions
) {
  switch (section) {
    case "totalSales":
      return (
        <KpiCard
          key={section}
          label="总销售额"
          value={`¥${formatCompactNumber(dataSummary.salesSummary.totalSales)}`}
        />
      );
    case "achievement":
      return (
        <KpiCard
          key={section}
          label="目标达成率"
          value={dataSummary.salesSummary.achievementRate}
        />
      );
    case "orders":
      return (
        <KpiCard
          key={section}
          label="订单量"
          value={formatCompactNumber(dataSummary.salesSummary.totalOrders)}
        />
      );
    case "aov":
      return (
        <KpiCard
          key={section}
          label="客单价"
          value={`¥${formatCompactNumber(dataSummary.salesSummary.avgOrderValue)}`}
        />
      );
    case "salesTrend":
      return (
        <ChartCard
          key={section}
          title="销售趋势"
          option={chartOptions.salesTrend}
          wide
        />
      );
    case "channel":
      return (
        <ChartCard
          key={section}
          title="渠道销售分布"
          option={chartOptions.channel}
        />
      );
    case "category":
      return (
        <ChartCard
          key={section}
          title="品类销售分布"
          option={chartOptions.category}
        />
      );
    case "daypart":
      return (
        <ChartCard
          key={section}
          title="时段销售分布"
          option={chartOptions.daypart}
        />
      );
    case "refund":
      return (
        <ChartCard
          key={section}
          title="退款趋势"
          option={chartOptions.refund}
        />
      );
  }
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
        "col-span-2 min-w-0 rounded-[8px] border border-[#dedfe2] bg-white p-4",
        wide && "xl:col-span-4"
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
