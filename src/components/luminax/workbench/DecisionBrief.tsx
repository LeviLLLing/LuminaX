"use client";

import { ArrowRight, CheckCircle2, Clock3, TriangleAlert } from "lucide-react";
import type { InsightSnapshotDto } from "@/modules/insights/insight-types";
import type { WorkbenchPresentationProfile } from "@/modules/workbench/workbench-presentation";
import { cn } from "@/lib/utils";

interface DecisionBriefProps {
  insight: InsightSnapshotDto | null;
  generationStatus: "idle" | "generating" | "failed";
  pendingActionIds: string[];
  assistantMode: WorkbenchPresentationProfile["assistantMode"];
  onOpenInsight(): void;
}

export function DecisionBrief({
  insight,
  generationStatus,
  pendingActionIds,
  assistantMode,
  onOpenInsight,
}: DecisionBriefProps) {
  if (!insight) {
    if (generationStatus === "idle") return null;

    const isGenerating = generationStatus === "generating";
    return (
      <section
        aria-live="polite"
        aria-busy={isGenerating}
        className="border-b border-border bg-white px-3 py-3 sm:px-4"
      >
        <BriefStatus
          kind={isGenerating ? "generating" : "failed"}
          label={
            isGenerating
              ? "正在生成决策简报"
              : "本次决策简报未更新"
          }
        />
      </section>
    );
  }

  const completedActions = insight.actions.filter((action) => action.completed).length;
  const briefActions = insight.actions.slice(0, 2);
  const actionProgress = (
    <div className="space-y-2" data-decision-brief-section="actions">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-[var(--luminax-positive)]" aria-hidden="true" />
        <span>{completedActions}/{insight.actions.length} 项已完成</span>
      </div>
      {briefActions.length > 0 && (
        <ul className="space-y-1.5">
          {briefActions.map((action) => {
            const isPending = pendingActionIds.includes(action.id);
            return (
              <li
                key={action.id}
                aria-busy={isPending}
                className="flex min-w-0 items-center gap-2 text-xs text-foreground"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    action.completed
                      ? "bg-[var(--luminax-positive)]"
                      : "bg-muted-foreground"
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{action.title}</span>
                {isPending && <span className="sr-only">正在保存</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
  const summary = (
    <h3
      className="text-sm leading-5 font-semibold text-foreground"
      data-decision-brief-section="summary"
    >
      {insight.headline}
    </h3>
  );

  return (
    <section
      aria-label="决策简报"
      aria-live="polite"
      aria-busy={generationStatus === "generating" || pendingActionIds.length > 0}
      className="shrink-0 border-b border-border bg-white px-3 py-3 sm:px-4"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">决策简报</p>
        {generationStatus !== "idle" && (
          <BriefStatus
            kind={generationStatus}
            label={generationStatus === "generating" ? "洞察更新中" : "保留上次洞察"}
          />
        )}
      </div>

      <div className="space-y-3">
        {assistantMode === "action_first" ? (
          <>
            {actionProgress}
            {summary}
          </>
        ) : (
          <>
            {summary}
            {actionProgress}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenInsight}
        className="mt-3 inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold text-foreground transition-colors hover:text-[var(--luminax-data)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        查看完整洞察
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </button>
    </section>
  );
}

function BriefStatus({
  kind,
  label,
}: {
  kind: "generating" | "failed";
  label: string;
}) {
  const Icon = kind === "generating" ? Clock3 : TriangleAlert;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        kind === "failed"
          ? "text-[var(--luminax-risk)]"
          : "text-muted-foreground"
      )}
    >
      <Icon className={cn("size-3.5", kind === "generating" && "animate-pulse")} aria-hidden="true" />
      {label}
    </span>
  );
}
