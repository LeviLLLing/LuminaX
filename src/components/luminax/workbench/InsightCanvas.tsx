"use client";

import { AnalysisPanel } from "@/components/luminax/workbench/AnalysisPanel";
import { OverviewPanel } from "@/components/luminax/workbench/OverviewPanel";
import { ReportView } from "@/components/luminax/workbench/ReportView";
import type { DataSummary } from "@/modules/domain/analysis-types";
import type {
  InsightView,
} from "@/modules/workbench/workbench-presentation";
import { getWorkbenchCopy } from "@/modules/workbench/workbench-presentation";
import type { WorkbenchTemplateId } from "@/modules/workbench/workbench-types";
import type { DashboardChartOptions } from "@/modules/visualization/chart-theme";
import { cn } from "@/lib/utils";

interface InsightCanvasProps {
  view: InsightView;
  templateId: WorkbenchTemplateId;
  availableMetricCodes: string[];
  dataSummary: DataSummary | null;
  chartOptions: DashboardChartOptions;
  reportHTML: string;
  analysisContent: string;
  isAnalyzing: boolean;
  onViewChange(view: InsightView): void;
}

const VIEW_TABS: ReadonlyArray<{ view: InsightView; label: string }> = [
  { view: "overview", label: "经营概览" },
  { view: "analysis", label: "经营分析" },
  { view: "report", label: "经营周报" },
];

export function InsightCanvas({
  view,
  templateId,
  availableMetricCodes,
  dataSummary,
  chartOptions,
  reportHTML,
  analysisContent,
  isAnalyzing,
  onViewChange,
}: InsightCanvasProps) {
  const { title } = getWorkbenchCopy(templateId);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f5f6f7]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#dedfe2] bg-white px-4 py-3 sm:px-5">
        <h2 className="min-w-0 text-sm font-semibold text-[#17181a]">{title}</h2>
        <nav
          aria-label="经营视图"
          className="grid w-full grid-cols-3 gap-1 sm:w-auto"
        >
          {VIEW_TABS.map((tab) => {
            const isReport = tab.view === "report";
            const disabled = isReport && !reportHTML;
            const active = view === tab.view;

            return (
              <button
                key={tab.view}
                type="button"
                aria-current={active ? "page" : undefined}
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onViewChange(tab.view)}
                className={cn(
                  "min-w-0 rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-45",
                  active
                    ? "bg-[#17181a] text-white"
                    : "bg-[#f5f6f7] text-[#4b4e55] hover:bg-[#e9eaec]"
                )}
              >
                <span className="block truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {view === "overview" && (
        <OverviewPanel
          availableMetricCodes={availableMetricCodes}
          dataSummary={dataSummary}
          chartOptions={chartOptions}
        />
      )}
      {view === "analysis" && (
        <AnalysisPanel
          availableMetricCodes={availableMetricCodes}
          dataSummary={dataSummary}
          chartOptions={chartOptions}
          analysisContent={analysisContent}
          isAnalyzing={isAnalyzing}
        />
      )}
      {view === "report" && <ReportView reportHTML={reportHTML} />}
    </section>
  );
}
