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
    <section className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-950">{config.title}</h1>
            <p className="mt-1 text-sm text-zinc-500">模块接口已预留</p>
          </div>
          <Button disabled className="bg-[#18181b] text-white">
            <Icon className="size-4" />
            {config.action}
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="grid min-w-[720px] grid-cols-5 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-600">
            {config.columns.map((column) => (
              <span key={column}>{column}</span>
            ))}
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
