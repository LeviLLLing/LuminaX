"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Clock3, Database, Store } from "lucide-react";
import { InsightActionChecklist } from "@/components/luminax/workbench/InsightActionChecklist";
import { InsightEvidenceSection } from "@/components/luminax/workbench/InsightEvidenceSection";
import { InsightFindingList } from "@/components/luminax/workbench/InsightFindingList";
import { isInsightScopeActive } from "@/modules/workbench/workbench-presentation";
import type { InsightFinding, InsightScope, InsightSnapshotDto } from "@/modules/insights/insight-types";

interface ActiveInsightScope {
  storeIds: string[];
  startDate: string;
  endDate: string;
}

export interface InsightActionPanelProps {
  insight: InsightSnapshotDto | null;
  isLoading: boolean;
  error: string | null;
  generationStatus: "idle" | "generating" | "failed";
  pendingActionIds: string[];
  activeScope: ActiveInsightScope;
  suggestions: string[];
  onAskQuestion(question: string): void;
  onApplyScope(scope: InsightScope): boolean;
  onToggleAction(actionId: string, completed: boolean): Promise<void>;
}

export function InsightActionPanel({
  insight,
  isLoading,
  error,
  generationStatus,
  pendingActionIds,
  activeScope,
  suggestions,
  onAskQuestion,
  onApplyScope,
  onToggleAction,
}: InsightActionPanelProps) {
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [highlightedEvidenceIds, setHighlightedEvidenceIds] = useState<Set<string>>(new Set());
  const evidenceRefs = useRef(new Map<string, HTMLElement>());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

  const registerEvidenceRef = useCallback((id: string, element: HTMLElement | null) => {
    if (element) evidenceRefs.current.set(id, element);
    else evidenceRefs.current.delete(id);
  }, []);

  const selectFinding = useCallback((finding: InsightFinding) => {
    setSelectedFindingId(finding.id);
    setHighlightedEvidenceIds(new Set(finding.evidenceIds));
    evidenceRefs.current.get(finding.evidenceIds[0])?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedEvidenceIds(new Set()), 1800);
  }, []);

  if (isLoading && !insight) return <InsightLoading label="正在加载最新洞察" />;
  if (generationStatus === "generating" && !insight) {
    return <InsightLoading label="正在生成第一份洞察" />;
  }
  if (generationStatus === "failed" && !insight) {
    return (
      <InsightEmpty
        title="本次洞察生成失败"
        suggestions={suggestions}
        onAskQuestion={onAskQuestion}
      />
    );
  }
  if (error && !insight && generationStatus !== "failed") {
    return <InsightAccessError message={error} />;
  }
  if (!insight) {
    return <InsightEmpty suggestions={suggestions} onAskQuestion={onAskQuestion} />;
  }

  const scopeMatches = isInsightScopeActive(activeScope, insight.scope);

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      {generationStatus === "generating" && (
        <StatusStrip>正在更新洞察，当前内容仍可查看</StatusStrip>
      )}
      {generationStatus === "failed" && (
        <StatusStrip tone="warning">
          本次洞察更新失败，聊天回答不受影响
        </StatusStrip>
      )}
      {error && generationStatus !== "failed" && (
        <StatusStrip tone="warning">行动状态保存失败，已恢复原状态</StatusStrip>
      )}
      {!scopeMatches && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0c86c] bg-[#fffbea] px-4 py-3 text-sm text-[#5b5000] sm:px-5">
          <span>当前筛选范围与该洞察生成范围不一致</span>
          <button
            type="button"
            onClick={() => onApplyScope(insight.scope)}
            className="inline-flex items-center gap-2 rounded-[8px] px-2 py-1.5 font-medium hover:bg-[#fff2a8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            <ArrowRightLeft className="size-4" aria-hidden="true" />
            切换至洞察范围
          </button>
        </div>
      )}

      <section className="border-b border-[#dedfe2] bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#666a73]">
          <span className="inline-flex items-center gap-1.5"><Database className="size-3.5" />来源：{insight.sourceQuestion}</span>
          <span className="inline-flex items-center gap-1.5"><Store className="size-3.5" />门店：{insight.scope.storeIds.join("、")}</span>
          <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" />{insight.scope.startDate} 至 {insight.scope.endDate}</span>
          {insight.scope.comparisonLabel && <span>对比：{insight.scope.comparisonLabel}</span>}
          <span>更新：{formatUpdatedAt(insight.updatedAt)}</span>
        </div>
      </section>

      <section className="border-b border-[#dedfe2] bg-[#fffbea] px-4 py-5 sm:px-5">
        <p className="text-xs font-medium text-[#716200]">核心判断</p>
        <h3 className="mt-2 break-words text-lg font-semibold leading-7 text-[#17181a]">
          {insight.headline}
        </h3>
      </section>

      <InsightFindingList
        findings={insight.findings}
        selectedFindingId={selectedFindingId}
        onSelectFinding={selectFinding}
      />
      <InsightEvidenceSection
        evidence={insight.evidence}
        highlightedEvidenceIds={highlightedEvidenceIds}
        registerEvidenceRef={registerEvidenceRef}
      />
      {insight.verificationItems.length > 0 && (
        <section className="border-b border-[#dedfe2] bg-white px-4 py-5 sm:px-5">
          <h3 className="text-sm font-semibold text-[#17181a]">待核查项</h3>
          <div className="mt-3 divide-y divide-[#e9eaec] border-y border-[#e9eaec]">
            {insight.verificationItems.map((item) => (
              <article key={item.id} className="grid gap-3 py-4 text-sm sm:grid-cols-3">
                <VerificationValue label="已观察事实" value={item.observedFact} />
                <VerificationValue label="可能原因" value={item.hypothesis} />
                <VerificationValue label="需核查" value={item.requiredCheck} />
              </article>
            ))}
          </div>
        </section>
      )}
      <InsightActionChecklist
        actions={insight.actions}
        pendingActionIds={pendingActionIds}
        onToggleAction={onToggleAction}
      />
    </div>
  );
}

function StatusStrip({ children, tone = "active" }: { children: React.ReactNode; tone?: "active" | "warning" }) {
  return (
    <div
      role="status"
      className={tone === "active"
        ? "border-b border-[#e0c86c] bg-[#fffbea] px-4 py-2 text-xs text-[#5b5000] sm:px-5"
        : "border-b border-[#efb4ae] bg-[#fff2f0] px-4 py-2 text-xs text-[#8f2922] sm:px-5"}
    >
      {children}
    </div>
  );
}

function InsightLoading({ label }: { label: string }) {
  return (
    <div role="status" className="min-h-[360px] bg-white px-4 py-6 sm:px-5">
      <p className="text-sm text-[#666a73]">{label}</p>
      <div className="mt-5 space-y-3" aria-hidden="true">
        <div className="h-16 w-full animate-pulse rounded-[4px] bg-[#e9eaec]" />
        <div className="h-24 w-full animate-pulse rounded-[4px] bg-[#e9eaec]" />
        <div className="h-24 w-full animate-pulse rounded-[4px] bg-[#e9eaec]" />
      </div>
    </div>
  );
}

function InsightEmpty({
  title = "尚无洞察",
  suggestions,
  onAskQuestion,
}: {
  title?: string;
  suggestions: string[];
  onAskQuestion(question: string): void;
}) {
  return (
    <div className="grid min-h-[360px] place-items-center bg-white px-4 py-8 text-center sm:px-5">
      <div className="max-w-lg">
        <p className="text-sm font-semibold text-[#17181a]">{title}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {suggestions.slice(0, 3).map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onAskQuestion(question)}
              className="rounded-[8px] border border-[#dedfe2] bg-white px-3 py-2 text-sm text-[#303238] hover:bg-[#f5f6f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function InsightAccessError({ message }: { message: string }) {
  return (
    <div className="grid min-h-[360px] place-items-center bg-white p-6 text-center">
      <div className="max-w-sm">
        <AlertTriangle className="mx-auto size-5 text-red-600" aria-hidden="true" />
        <p className="mt-3 text-sm text-[#44474d]">{message}</p>
      </div>
    </div>
  );
}

function VerificationValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-[#777b84]">{label}</p>
      <p className="mt-1 break-words leading-6 text-[#303238]">{value}</p>
    </div>
  );
}

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
