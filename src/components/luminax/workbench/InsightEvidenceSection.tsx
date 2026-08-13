"use client";

import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { buildInsightEvidenceChartOption } from "@/modules/insights/insight-chart-options";
import type { InsightEvidence } from "@/modules/insights/insight-types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface InsightEvidenceSectionProps {
  evidence: InsightEvidence[];
  highlightedEvidenceIds: ReadonlySet<string>;
  registerEvidenceRef(id: string, element: HTMLElement | null): void;
}

export function InsightEvidenceSection({
  evidence,
  highlightedEvidenceIds,
  registerEvidenceRef,
}: InsightEvidenceSectionProps) {
  return (
    <section className="border-b border-[#dedfe2] bg-[#f5f6f7] px-4 py-5 sm:px-5">
      <h3 className="text-sm font-semibold text-[#17181a]">支持证据</h3>
      <div className="mt-3 space-y-3">
        {evidence.map((item) => (
          <article
            key={item.id}
            ref={(element) => registerEvidenceRef(item.id, element)}
            data-highlighted={highlightedEvidenceIds.has(item.id) ? "true" : "false"}
            className="rounded-[8px] border border-[#dedfe2] bg-white px-3 py-4 transition-shadow data-[highlighted=true]:border-[#9b8700] data-[highlighted=true]:shadow-[0_0_0_2px_rgba(255,230,0,0.32)] sm:px-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-[#17181a]">{item.title}</h4>
              <Badge variant="outline">基准：{item.baselineLabel}</Badge>
            </div>
            <div
              className="mt-3 w-full min-w-0"
              style={{ height: Math.max(220, item.series.length * 38 + 72) }}
            >
              <ReactECharts
                option={buildInsightEvidenceChartOption(item)}
                style={{ height: "100%", width: "100%" }}
              />
            </div>
            <p className="mt-3 border-t border-[#e9eaec] pt-3 text-sm leading-6 text-[#4b4e55]">
              {item.interpretation}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
