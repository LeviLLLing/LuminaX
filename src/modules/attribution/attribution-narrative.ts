import type {
  AttributionData,
  AttributionFactorContribution,
} from "@/modules/attribution/attribution-types";
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
  const issue = describeMainIssue(data.orderVsAov.mainIssue);
  const top = data.factorContributions?.[0];
  if (top && top.contribution !== 0) {
    const sign = top.contribution > 0 ? "+" : "";
    return `主要问题判断为 ${issue}。当前最高影响因子为${
      top.label || top.factor
    }（${sign}${formatMoney(
      top.contribution
    )}，${top.evidence}，置信度${confidenceLabel(top.confidence)}）。`;
  }
  const topFactor = scoreAttributionFactors(data)[0];
  return `主要问题判断为 ${issue}。当前最高影响因素为${topFactor.factor}：${topFactor.reason}。`;
}

function formatMoney(value: number): string {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function confidenceLabel(
  confidence: AttributionFactorContribution["confidence"]
): string {
  return confidence === "high" ? "高" : confidence === "medium" ? "中" : "低";
}
