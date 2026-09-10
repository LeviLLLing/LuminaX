"use client";

import { ChevronDown } from "lucide-react";

export function InsightSectionToggle({
  label,
  expanded,
  controls,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  controls: string;
  onToggle(): void;
}) {
  return (
    <button
      type="button"
      aria-label={`切换${label}`}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>{label}</span>
      <ChevronDown
        aria-hidden="true"
        className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
      />
    </button>
  );
}
