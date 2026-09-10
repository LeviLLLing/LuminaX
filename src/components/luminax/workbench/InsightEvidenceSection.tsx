"use client";

import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { buildInsightEvidenceChartOption } from "@/modules/insights/insight-chart-options";
import type { InsightEvidence } from "@/modules/insights/insight-types";
import { InsightSectionToggle } from "./InsightSectionToggle";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface InsightEvidenceSectionProps {
  evidence: InsightEvidence[];
  expanded: boolean;
  highlightedEvidenceIds: ReadonlySet<string>;
  registerEvidenceRef(id: string, element: HTMLElement | null): void;
  onToggle(): void;
}

export function InsightEvidenceSection({
  evidence,
  expanded,
  highlightedEvidenceIds,
  registerEvidenceRef,
  onToggle,
}: InsightEvidenceSectionProps) {
  return (
    <section
      data-insight-section="evidence"
      className="border-b border-border px-4 py-6 sm:px-6"
    >
      <InsightSectionToggle
        label="支持证据"
        expanded={expanded}
        controls="insight-evidence-content"
        onToggle={onToggle}
      />
      {expanded && (
        <div
          id="insight-evidence-content"
          className="mt-3 divide-y divide-border border-y border-border"
        >
          {evidence.map((item) => (
            <div
              key={item.id}
              ref={(element) => registerEvidenceRef(item.id, element)}
              data-highlighted={
                highlightedEvidenceIds.has(item.id) ? "true" : "false"
              }
              className="px-2 py-5 transition-colors data-[highlighted=true]:bg-[color-mix(in_srgb,var(--luminax-yellow)_12%,white)] sm:px-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">
                  {item.title}
                </h4>
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
              <p className="mt-3 border-t border-border pt-3 text-sm leading-6 text-muted-foreground">
                {item.interpretation}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
