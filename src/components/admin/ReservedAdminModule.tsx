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
          className="overflow-x-auto rounded-md border border-[var(--border)] bg-white"
          style={{ containerType: "inline-size" }}
        >
          <table
            data-admin-table-state="empty"
            className="w-full min-w-[720px] border-collapse text-left"
          >
            <thead className="border-b border-[var(--border)] bg-[var(--muted)] text-xs font-semibold text-[var(--muted-foreground)]">
              <tr>
                {config.columns.map((column) => (
                  <th key={column} scope="col" className="px-4 py-3 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={config.columns.length} className="p-0">
                  <div className="sticky left-0 grid h-72 w-[100cqw] content-center justify-items-center px-6 text-center">
                    <Icon className="mx-auto mb-3 size-8 text-zinc-300" aria-hidden="true" />
                    <p className="text-sm font-medium text-zinc-700">暂无配置</p>
                    <p className="mt-1 text-xs text-muted-foreground">等待对应管理模块接入</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
