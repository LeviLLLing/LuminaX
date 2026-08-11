import type { AttributionData } from "@/modules/attribution/attribution-types";
import { scoreAttributionFactors } from "@/modules/attribution/attribution-scorer";

export function describeMainIssue(
  issue: AttributionData["orderVsAov"]["mainIssue"]
): string {
  switch (issue) {
    case "orders":
      return "订单量不足";
    case "aov":
      return "客单价不足";
    case "both":
      return "订单量与客单价同时承压";
    default:
      return "未发现明显单一主因";
  }
}

export function buildAttributionNarrative(data: AttributionData): string {
  const topFactor = scoreAttributionFactors(data)[0];
  const issue = describeMainIssue(data.orderVsAov.mainIssue);
  return `主要问题判断为 ${issue}。当前最高影响因素为${topFactor.factor}：${topFactor.reason}。`;
}
