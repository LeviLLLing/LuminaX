"use client";

interface ReportViewProps {
  reportHTML: string;
}

export function ReportView({ reportHTML }: ReportViewProps) {
  return (
    <div className="min-h-[640px] min-w-0 flex-1 bg-white">
      <iframe
        srcDoc={reportHTML}
        className="h-full min-h-[640px] w-full border-0"
        title="经营周报"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
