"use client";

import { useState, type ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface WorkbenchShellProps {
  header: ReactNode;
  scopeBar: ReactNode;
  dataPanel: ReactNode;
  assistantPanel: ReactNode;
}

type MobilePane = "data" | "assistant";

export function WorkbenchShell({
  header,
  scopeBar,
  dataPanel,
  assistantPanel,
}: WorkbenchShellProps) {
  const [mobilePane, setMobilePane] = useState<MobilePane>("data");
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);

  return (
    <div data-workbench-shell="true" className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-[var(--luminax-canvas)] text-foreground">
      {header}
      <MobilePaneSwitch value={mobilePane} onChange={setMobilePane} />

      <div
        className={cn(
          "grid min-h-0 flex-1",
          assistantCollapsed
            ? "md:grid-cols-[minmax(0,1fr)_48px]"
            : "md:grid-cols-[minmax(0,2.1fr)_minmax(280px,1fr)] lg:grid-cols-[minmax(0,2.1fr)_minmax(320px,1fr)]"
        )}
      >
        <section
          className={cn(
            "min-w-0",
            mobilePane === "data"
              ? "flex min-h-0 flex-col"
              : "hidden min-h-0 md:flex md:flex-col"
          )}
        >
          <div data-workbench-region="scope" className="shrink-0">
            {scopeBar}
          </div>
          <div data-workbench-region="data" className="flex min-h-0 flex-1">
            {dataPanel}
          </div>
        </section>

        <aside
          data-workbench-region="assistant"
          className={cn(
            "min-w-0 border-l border-border bg-background",
            mobilePane === "assistant"
              ? "flex min-h-0 flex-col"
              : "hidden min-h-0 flex-col md:flex"
          )}
        >
          <AssistantCollapseButton
            collapsed={assistantCollapsed}
            onClick={() => setAssistantCollapsed((value) => !value)}
          />
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1",
              assistantCollapsed && "md:hidden"
            )}
          >
            {assistantPanel}
          </div>
        </aside>
      </div>
    </div>
  );
}

function MobilePaneSwitch({
  value,
  onChange,
}: {
  value: MobilePane;
  onChange(value: MobilePane): void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 border-b border-border bg-white p-1 md:hidden">
      <SegmentButton
        active={value === "data"}
        onClick={() => onChange("data")}
      >
        经营数据
      </SegmentButton>
      <SegmentButton
        active={value === "assistant"}
        onClick={() => onChange("assistant")}
      >
        决策协同
      </SegmentButton>
    </div>
  );
}

function SegmentButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-w-0 rounded-md px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1",
        active
          ? "bg-[var(--luminax-yellow)] text-[var(--luminax-ink)]"
          : "text-muted-foreground hover:bg-[var(--luminax-canvas)]"
      )}
    >
      <span className="block overflow-hidden text-ellipsis whitespace-nowrap">
        {children}
      </span>
    </button>
  );
}

function AssistantCollapseButton({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick(): void;
}) {
  const Icon = collapsed ? PanelRightOpen : PanelRightClose;
  const label = collapsed ? "展开决策协同" : "收起决策协同";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          title={label}
          aria-label={label}
          aria-expanded={!collapsed}
          onClick={onClick}
          className="hidden size-9 place-items-center self-end border-b border-border bg-white text-foreground transition-colors hover:bg-[var(--luminax-canvas)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:grid"
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}
