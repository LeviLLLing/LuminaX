"use client";

interface ReportViewProps {
  reportHTML: string;
}

export function ReportView({ reportHTML }: ReportViewProps) {
  const hasReport = reportHTML.trim().length > 0;

  return (
    <article
      aria-label="经营周报"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white"
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground">正式报告</p>
          <h2 className="mt-1 text-base font-semibold text-foreground">经营周报</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          {hasReport ? "已生成" : "暂无内容"}
        </span>
      </header>
      {hasReport ? (
        <iframe
          srcDoc={reportHTML}
          className="h-full min-h-[640px] w-full border-0"
          title="经营周报"
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <div role="status" className="grid min-h-64 place-items-center px-6 text-sm text-muted-foreground">
          当前暂无可查看的经营周报
        </div>
      )}
    </article>
  );
}
