"use client";

import { FileCog, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReservedAdminModuleProps {
  module: "reports" | "report-settings";
}

const MODULES = {
  reports: {
    title: "报表管理",
    icon: FileText,
    action: "新增报表",
    columns: ["报表名称", "类型", "负责人", "更新时间", "状态"],
  },
  "report-settings": {
    title: "报表设置",
    icon: FileCog,
    action: "新增配置",
    columns: ["配置名称", "报表周期", "接收范围", "发送时间", "状态"],
  },
} as const;

export function ReservedAdminModule({ module }: ReservedAdminModuleProps) {
  const config = MODULES[module];
  const Icon = config.icon;
  return (
    <section className="p-4 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold text-[var(--muted-foreground)]">报表配置</p>
            <h1 className="text-xl font-semibold text-[var(--luminax-ink)]">{config.title}</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">模块接口已预留，当前无可用配置</p>
          </div>
          <Button disabled className="h-11 bg-[var(--luminax-ink)] text-white">
            <Icon className="size-4" />
            {config.action}
          </Button>
        </div>

        <div
          data-admin-table-state="empty"
          className="overflow-hidden rounded-md border border-[var(--border)] bg-white"
        >
          <div className="overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-5 border-b border-[var(--border)] bg-[var(--muted)] px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)]">
              {config.columns.map((column) => (
                <span key={column}>{column}</span>
              ))}
            </div>
          </div>
          <div className="grid min-h-72 place-items-center px-6 text-center">
            <div>
              <Icon className="mx-auto mb-3 size-8 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-700">暂无配置</p>
              <p className="mt-1 text-xs text-zinc-400">等待对应管理模块接入</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
