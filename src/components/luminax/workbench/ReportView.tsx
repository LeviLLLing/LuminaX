"use client";

interface ReportViewProps {
  reportHTML: string;
}

export function ReportView({ reportHTML }: ReportViewProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-white">
      <iframe
        srcDoc={reportHTML}
        className="h-full min-h-[640px] w-full border-0"
        title="经营周报"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
