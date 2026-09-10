import type { ReactNode } from "react";

export interface ProductBrandBarProps {
  contextLabel?: string;
  userLabel?: string;
  actions?: ReactNode;
  compact?: boolean;
}

export function ProductBrandBar({
  contextLabel,
  userLabel,
  actions,
  compact = false,
}: ProductBrandBarProps) {
  return (
    <header
      data-luminax-brand="true"
      className={`flex h-14 shrink-0 items-center justify-between gap-4 border-b-[3px] border-[var(--luminax-yellow)] bg-[var(--luminax-ink)] text-white ${
        compact ? "px-4" : "px-5 sm:px-7"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-lg font-semibold">LuminaX</span>
        {contextLabel && (
          <>
            <span aria-hidden="true" className="h-5 w-px bg-white/25" />
            <span className="truncate text-sm text-white/75">
              {contextLabel}
            </span>
          </>
        )}
      </div>

      {(userLabel || actions) && (
        <div className="flex shrink-0 items-center gap-3">
          {userLabel && (
            <span className="hidden text-sm text-white/75 sm:inline">
              {userLabel}
            </span>
          )}
          {actions}
        </div>
      )}
    </header>
  );
}
