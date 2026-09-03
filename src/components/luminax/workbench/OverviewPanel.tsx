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

  const kpiSections = sections.filter(isKpiSection);
  const chartSections = sections.filter((section) => !isKpiSection(section));

  return (
    <div className="min-h-0 min-w-0 flex-1 space-y-7 overflow-y-auto p-4 sm:p-5">
      {kpiSections.length > 0 && (
        <section
          aria-labelledby="overview-kpis-heading"
          data-overview-section="kpis"
          className="space-y-3"
        >
          <SectionHeading
            id="overview-kpis-heading"
            title="关键指标"
            description={`${dataSummary.dateRange.start} 至 ${dataSummary.dateRange.end}`}
          />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {kpiSections.map((section) =>
              renderSection(section, dataSummary, chartOptions)
            )}
          </div>
        </section>
      )}

      {chartSections.length > 0 && (
        <section
          aria-labelledby="overview-charts-heading"
          data-overview-section="charts"
          className="space-y-3"
        >
          <SectionHeading
            id="overview-charts-heading"
            title="趋势与结构"
            description="基于当前授权范围"
          />
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            {chartSections.map((section) =>
              renderSection(section, dataSummary, chartOptions)
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function isKpiSection(section: InsightSectionId): boolean {
  return section === "totalSales" ||
    section === "achievement" ||
    section === "orders" ||
    section === "aov";
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
    <article className="min-w-0 rounded-md border border-border bg-white p-4">
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-2xl font-semibold text-foreground">{value}</p>
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
        "min-w-0 rounded-md border border-border bg-white p-4",
        wide && "lg:col-span-2"
      )}
    >
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="h-[280px] min-w-0">
        <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
      </div>
    </section>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-end justify-between gap-2 border-b border-border pb-2">
      <h3 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center p-4 sm:p-5">
      <p className="max-w-sm text-center text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
