"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InsightAction } from "@/modules/insights/insight-types";

interface InsightActionChecklistProps {
  actions: InsightAction[];
  onToggleAction(actionId: string, completed: boolean): Promise<void>;
}

export function InsightActionChecklist({
  actions,
  onToggleAction,
}: InsightActionChecklistProps) {
  return (
    <section className="bg-white px-4 py-5 sm:px-5">
      <h3 className="text-sm font-semibold text-[#17181a]">建议行动</h3>
      <div className="mt-3 divide-y divide-[#e9eaec] border-y border-[#e9eaec]">
        {actions.map((action) => (
          <label
            key={action.id}
            className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 py-4"
          >
            <Checkbox
              checked={action.completed}
              aria-label={`${action.completed ? "取消完成" : "标记完成"}：${action.title}`}
              onCheckedChange={(checked) => {
                void onToggleAction(action.id, checked === true);
              }}
              className="mt-0.5 data-[state=checked]:border-[#17181a] data-[state=checked]:bg-[#17181a]"
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{action.priority}</Badge>
                <span
                  className={cn(
                    "break-words text-sm font-medium text-[#17181a]",
                    action.completed && "text-[#777b84] line-through"
                  )}
                >
                  {action.title}
                </span>
              </span>
              <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#666a73]">
                <span>负责角色：{action.ownerRole}</span>
                <span>验证指标：{action.verificationMetricLabel}</span>
              </span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
