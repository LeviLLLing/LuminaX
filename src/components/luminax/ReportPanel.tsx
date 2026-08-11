interface ReportPanelProps {
  reportHTML: string;
}

export function ReportPanel({ reportHTML }: ReportPanelProps) {
  return (
    <div className="w-[68%] overflow-y-auto border-r border-border">
      <iframe
        srcDoc={reportHTML}
        className="w-full h-full border-0"
        title="周报"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
