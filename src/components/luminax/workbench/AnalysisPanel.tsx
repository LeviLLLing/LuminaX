"use client";

import { MarkdownRenderer } from "@/components/markdown-renderer";
import { OverviewPanel } from "@/components/luminax/workbench/OverviewPanel";
import type { DataSummary } from "@/modules/domain/analysis-types";
import type { DashboardChartOptions } from "@/modules/visualization/chart-theme";

interface AnalysisPanelProps {
  availableMetricCodes: string[];
  dataSummary: DataSummary | null;
  chartOptions: DashboardChartOptions;
  analysisContent: string;
  isAnalyzing: boolean;
}

export function AnalysisPanel({
  availableMetricCodes,
  dataSummary,
  chartOptions,
  analysisContent,
  isAnalyzing,
}: AnalysisPanelProps) {
  const hasContent = analysisContent.trim().length > 0;

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <section className="border-b border-[#dedfe2] bg-white px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold text-[#17181a]">分析结论</h3>
        <div className="mt-3 min-w-0 break-words text-sm text-[#303238]">
          {hasContent ? (
            <MarkdownRenderer content={analysisContent} />
          ) : isAnalyzing ? (
            <AnalysisSkeleton />
          ) : (
            <p className="text-[#666a73]">当前暂无分析内容</p>
          )}
        </div>
      </section>

      <section className="min-w-0">
        <div className="flex items-center justify-between px-4 pt-4 sm:px-5">
          <h3 className="text-sm font-semibold text-[#17181a]">支撑数据</h3>
        </div>
        <OverviewPanel
          availableMetricCodes={availableMetricCodes}
          dataSummary={dataSummary}
          chartOptions={chartOptions}
        />
      </section>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div aria-label="正在生成分析" className="space-y-2" role="status">
      <div className="h-3 w-full rounded-[2px] bg-[#e9eaec]" />
      <div className="h-3 w-11/12 rounded-[2px] bg-[#e9eaec]" />
      <div className="h-3 w-4/5 rounded-[2px] bg-[#e9eaec]" />
    </div>
  );
}
