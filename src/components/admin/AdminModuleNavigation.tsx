"use client";

import type { LucideIcon } from "lucide-react";
import { BarChart3, FileCog, FileText, KeyRound } from "lucide-react";

export type AdminModule =
  | "metrics"
  | "permissions"
  | "reports"
  | "report-settings";

interface AdminModuleNavigationProps {
  activeModule: AdminModule;
  onChange: (module: AdminModule) => void;
}

const ADMIN_MODULES: ReadonlyArray<{
  id: AdminModule;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "metrics", label: "指标注册", icon: BarChart3 },
  { id: "permissions", label: "权限管理", icon: KeyRound },
  { id: "reports", label: "报表管理", icon: FileText },
  { id: "report-settings", label: "报表设置", icon: FileCog },
];

export function AdminModuleNavigation({
  activeModule,
  onChange,
}: AdminModuleNavigationProps) {
  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-[var(--border)] bg-white md:block">
        <div className="px-5 pb-2 pt-5 text-xs font-semibold text-[var(--muted-foreground)]">
          管理能力
        </div>
        <nav className="px-3 pb-5" aria-label="管理模块">
          {ADMIN_MODULES.map((item) => {
            const Icon = item.icon;
            const active = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(item.id)}
                className={`mb-1 flex h-11 w-full items-center gap-3 rounded-md border px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--luminax-data)] ${
                  active
                    ? "border-[var(--input)] bg-[var(--muted)] font-semibold text-[var(--luminax-ink)]"
                    : "border-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--luminax-ink)]"
                }`}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded ${
                    active
                      ? "bg-[var(--luminax-yellow)] text-[var(--luminax-ink)]"
                      : "bg-[var(--secondary)]"
                  }`}
                >
                  <Icon className="size-4" />
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <nav
        className="flex overflow-x-auto border-b border-[var(--border)] bg-white px-3 md:hidden"
        aria-label="管理模块"
      >
        {ADMIN_MODULES.map((item) => {
          const Icon = item.icon;
          const active = activeModule === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onChange(item.id)}
              className={`flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--luminax-data)] ${
                active
                  ? "border-[var(--luminax-ink)] font-semibold text-[var(--luminax-ink)]"
                  : "border-transparent text-[var(--muted-foreground)]"
              }`}
            >
              <Icon className="size-4" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
