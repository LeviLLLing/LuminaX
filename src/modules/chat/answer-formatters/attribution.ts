import type { AttributionData } from "@/modules/attribution/attribution-types";
import { buildAttributionNarrative } from "@/modules/attribution/attribution-narrative";
import { money, num, pct } from "@/modules/chat/answer-formatters/format-utils";

export function formatAttribution(data: Record<string, unknown>): string {
  const attributionData = data as unknown as AttributionData;
  const { salesSummary, orderVsAov, refundSummary, managerFeedback } =
    attributionData;

  const issueMap: Record<string, string> = {
    orders: "订单量不足",
    aov: "客单价偏低",
    both: "订单量和客单价同时承压",
    none: "未发现单一主导因素",
  };

  return [
    "### 结果定位",
    `销售额 ${money(salesSummary.totalSales)}，目标 ${money(salesSummary.totalTarget)}，达成率 **${pct(salesSummary.achievementRate)}**。`,
    "",
    "### 结构拆解",
    `当前主要问题判断为：**${issueMap[orderVsAov.mainIssue] || orderVsAov.mainIssue}**。订单量偏差 ${num(orderVsAov.ordersDrop)}，客单价偏差 ${money(orderVsAov.aovDrop)}。`,
    buildAttributionNarrative(attributionData),
    "",
    "### 关联证据",
    `退款金额 ${money(refundSummary.totalRefund)}，退款率 ${pct(refundSummary.refundRate)}，取消订单 ${num(refundSummary.totalCancelled)}。`,
    managerFeedback.length > 0
      ? managerFeedback
          .slice(0, 5)
          .map(
            (feedback) =>
              `- ${feedback.date} ${feedback.store_id}：${feedback.feedback_type}，${feedback.feedback_detail}`
          )
          .join("\n")
      : "- 暂无店长反馈事件。",
    "",
    "### 运营建议",
    "建议先复盘异常日期和门店反馈，再按渠道、时段和品类继续拆解销售缺口。",
  ].join("\n");
}
