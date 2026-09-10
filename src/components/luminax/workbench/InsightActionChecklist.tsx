"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InsightAction } from "@/modules/insights/insight-types";
import { InsightSectionToggle } from "./InsightSectionToggle";

interface InsightActionChecklistProps {
  actions: InsightAction[];
  expanded: boolean;
  pendingActionIds: string[];
  onToggleAction(actionId: string, completed: boolean): Promise<void>;
  onToggle(): void;
}

export function InsightActionChecklist({
  actions,
  expanded,
  pendingActionIds,
  onToggleAction,
  onToggle,
}: InsightActionChecklistProps) {
  return (
    <section
      data-insight-section="actions"
      className="px-4 py-6 sm:px-6"
    >
      <InsightSectionToggle
        label="行动清单"
        expanded={expanded}
        controls="insight-actions-content"
        onToggle={onToggle}
      />
      {expanded && (
        <div
          id="insight-actions-content"
          className="mt-3 divide-y divide-border border-y border-border"
        >
          {actions.map((action) => {
            const pending = pendingActionIds.includes(action.id);
            return (
              <label
                key={action.id}
                className={cn(
                  "grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-4",
                  pending ? "cursor-wait" : "cursor-pointer"
                )}
              >
                <Checkbox
                  checked={action.completed}
                  disabled={pending}
                  aria-busy={pending}
                  aria-label={`${action.completed ? "取消完成" : "标记完成"}：${action.title}`}
                  onCheckedChange={(checked) => {
                    void onToggleAction(action.id, checked === true);
                  }}
                  className="mt-0.5 data-[state=checked]:border-foreground data-[state=checked]:bg-foreground"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{action.priority}</Badge>
                    <span
                      className={cn(
                        "break-words text-sm font-medium text-foreground",
                        action.completed &&
                          "text-muted-foreground line-through"
                      )}
                    >
                      {action.title}
                    </span>
                  </span>
                  <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>负责角色：{action.ownerRole}</span>
                    <span>验证指标：{action.verificationMetricLabel}</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
