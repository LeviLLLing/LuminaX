"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ChevronLeft,
  FileCog,
  FileText,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { MetricRegistryPanel } from "./MetricRegistryPanel";
import { PermissionManagementPanel } from "./PermissionManagementPanel";
import { ReservedAdminModule } from "./ReservedAdminModule";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";

type AdminModule = "metrics" | "permissions" | "reports" | "report-settings";

const NAV_ITEMS: Array<{
  id: AdminModule;
  label: string;
  icon: typeof BarChart3;
}> = [
  { id: "metrics", label: "指标注册", icon: BarChart3 },
  { id: "permissions", label: "权限管理", icon: KeyRound },
  { id: "reports", label: "报表管理", icon: FileText },
  { id: "report-settings", label: "报表设置", icon: FileCog },
];

export function AdminShell({ user }: { user: AuthenticatedUser }) {
  const [activeModule, setActiveModule] = useState<AdminModule>("metrics");

  return (
    <div className="min-h-[100dvh] bg-[#f3f4f6] text-[#202124]">
      <header className="flex h-14 items-center justify-between border-b-4 border-[#FFE600] bg-[#18181b] px-4 text-white md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            title="返回 LuminaX"
            className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE600]"
          >
            <ChevronLeft className="size-4" />
            <span className="sr-only">返回 LuminaX</span>
          </Link>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[#FFE600]">LuminaX 管理后台</div>
            <div className="hidden text-xs text-zinc-400 sm:block">经营分析配置中心</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <ShieldCheck className="size-4 text-emerald-400" />
          <span className="hidden max-w-28 truncate sm:inline">{user.displayName}</span>
          <LogoutButton className="grid size-8 place-items-center rounded-md text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50" />
        </div>
      </header>

      <div className="flex min-h-[calc(100dvh-3.5rem)]">
        <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white md:block">
          <nav className="py-4" aria-label="管理模块">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  className={`flex h-11 w-full items-center gap-3 border-l-4 px-5 text-left text-sm transition-colors ${
                    active
                      ? "border-[#FFE600] bg-zinc-100 font-semibold text-zinc-950"
                      : "border-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
                  }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <nav
            className="flex overflow-x-auto border-b border-zinc-200 bg-white px-3 md:hidden"
            aria-label="管理模块"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveModule(item.id)}
                  className={`flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-xs ${
                    active
                      ? "border-[#18181b] font-semibold text-zinc-950"
                      : "border-transparent text-zinc-500"
                  }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {activeModule === "metrics" && <MetricRegistryPanel />}
          {activeModule === "permissions" && <PermissionManagementPanel />}
          {(activeModule === "reports" || activeModule === "report-settings") && (
            <ReservedAdminModule module={activeModule} />
          )}
        </main>
      </div>
    </div>
  );
}
