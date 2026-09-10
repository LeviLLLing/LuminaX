"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import {
  AdminModuleNavigation,
  type AdminModule,
} from "./AdminModuleNavigation";
import { MetricRegistryPanel } from "./MetricRegistryPanel";
import { PermissionManagementPanel } from "./PermissionManagementPanel";
import { ReservedAdminModule } from "./ReservedAdminModule";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ProductBrandBar } from "@/components/luminax/ProductBrandBar";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";

export function AdminShell({ user }: { user: AuthenticatedUser }) {
  const [activeModule, setActiveModule] = useState<AdminModule>("metrics");

  return (
    <div
      data-admin-layout="capability-navigation"
      className="min-h-[100dvh] bg-[var(--luminax-canvas)] text-[var(--foreground)]"
    >
      <ProductBrandBar
        contextLabel="管理后台"
        userLabel={user.displayName}
        actions={
          <div className="flex items-center gap-1">
            <span
              title="超级管理员"
              className="grid size-10 place-items-center text-[var(--luminax-positive)]"
            >
              <ShieldCheck className="size-4" />
              <span className="sr-only">超级管理员</span>
            </span>
            <Link
              href="/"
              title="返回 LuminaX"
              className="grid size-10 shrink-0 place-items-center rounded-md text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--luminax-yellow)]"
            >
              <ChevronLeft className="size-4" />
              <span className="sr-only">返回 LuminaX</span>
            </Link>
            <LogoutButton className="grid size-10 place-items-center rounded-md text-white/75 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50" />
          </div>
        }
      />

      <div className="min-h-[calc(100dvh-3.5rem)] md:flex">
        <AdminModuleNavigation
          activeModule={activeModule}
          onChange={setActiveModule}
        />
        <main className="min-w-0 flex-1">
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
