"use client";

import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InsightFinding } from "@/modules/insights/insight-types";

const SEVERITY_LABELS: Record<InsightFinding["severity"], string> = {
  high: "高关注",
  medium: "中关注",
  low: "低关注",
  positive: "正向",
};

const CONFIDENCE_LABELS: Record<InsightFinding["confidence"], string> = {
  high: "高置信",
  medium: "中置信",
  needs_verification: "待核查",
};

interface InsightFindingListProps {
  findings: InsightFinding[];
  selectedFindingId: string | null;
  onSelectFinding(finding: InsightFinding): void;
}

export function InsightFindingList({
  findings,
  selectedFindingId,
  onSelectFinding,
}: InsightFindingListProps) {
  return (
    <section className="border-b border-[#dedfe2] bg-white px-4 py-5 sm:px-5">
      <h3 className="text-sm font-semibold text-[#17181a]">关键发现</h3>
      <div className="mt-3 divide-y divide-[#e9eaec] border-y border-[#e9eaec]">
        {findings.map((finding) => (
          <article
            key={finding.id}
            aria-current={selectedFindingId === finding.id ? "true" : undefined}
            className={cn(
              "grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
              selectedFindingId === finding.id && "bg-[#fffbea]"
            )}
          >
            <div className="min-w-0 px-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[#17181a]">
                  {finding.title}
                </span>
                <Badge variant="outline">{SEVERITY_LABELS[finding.severity]}</Badge>
                <Badge variant="secondary">{CONFIDENCE_LABELS[finding.confidence]}</Badge>
              </div>
              <p className="mt-2 break-words text-sm leading-6 text-[#4b4e55]">
                {finding.summary}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 px-2 sm:justify-end">
              <span className="whitespace-nowrap text-base font-semibold text-[#17181a]">
                {finding.displayValue}
              </span>
              <button
                type="button"
                onClick={() => onSelectFinding(finding)}
                className="inline-flex items-center gap-1 rounded-[8px] px-2 py-2 text-xs font-medium text-[#303238] hover:bg-[#e9eaec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
              >
                查看证据
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
