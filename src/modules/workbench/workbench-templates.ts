import type { WorkbenchTemplate } from "./workbench-types";

const REGIONAL_MANAGER_TEMPLATE = Object.freeze({
  id: "regional_manager",
  intentOrder: Object.freeze([
    "anomaly_detection",
    "achievement_rate",
    "compare",
    "attribution",
    "report",
    "order_trend",
    "aov_trend",
    "channel_mix",
    "daypart_analysis",
    "promotion_contribution",
    "refund_rate",
    "custom_metric",
  ]),
}) satisfies WorkbenchTemplate;

const DEFAULT_TEMPLATE = Object.freeze({
  id: "default",
  intentOrder: Object.freeze([
    "achievement_rate",
    "order_trend",
    "aov_trend",
    "channel_mix",
    "daypart_analysis",
    "promotion_contribution",
    "refund_rate",
    "anomaly_detection",
    "compare",
    "attribution",
    "report",
    "custom_metric",
  ]),
}) satisfies WorkbenchTemplate;

export function resolveWorkbenchTemplate(role: string): WorkbenchTemplate {
  return role === "manager" ? REGIONAL_MANAGER_TEMPLATE : DEFAULT_TEMPLATE;
}
