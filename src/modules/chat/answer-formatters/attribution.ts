import type {
  AttributionData,
  AttributionFactorContribution,
} from "@/modules/attribution/attribution-types";
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

  const lines = [
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
  ];

  // ---- v2：缺口分解 ----
  const decomposition = attributionData.decomposition;
  if (decomposition) {
    const benchmarkLabel = attributionData.benchmark?.label || "基准";
    const dimensionLines = decomposition.dimensionContributions
      .slice(0, 6)
      .map(
        (item) =>
          `| ${item.dimension} | ${item.name} | ${money(item.contribution)} | ${pct(
            item.share
          )} |`
      );
    lines.splice(
      lines.indexOf("### 结构拆解") + 3,
      0,
      "",
      `### 缺口分解（${benchmarkLabel}）`,
      `总缺口 ${money(decomposition.totalGap)}：订单量缺口 ${money(
        decomposition.orderVolumeGap
      )}，客单价缺口 ${money(decomposition.aovGap)}，交互项 ${money(
        decomposition.interaction
      )}。`,
      ...(dimensionLines.length > 0
        ? [
            "",
            "| 维度 | 项目 | 贡献金额 | 占比 |",
            "|---|---:|---:|---:|",
            ...dimensionLines,
          ]
        : ["", "当前基准无结构数据，维度级缺口暂不拆分。"]),
      ""
    );
  }

  // ---- v2：影响因子 ----
  const factors = attributionData.factorContributions || [];
  if (factors.length > 0) {
    const factorLines = factors.slice(0, 5).map(
      (factor) =>
        `- **${factor.label || factor.factor}**：${sign(factor.contribution)}${money(
          factor.contribution
        )}（${factor.evidence}，置信度${confidenceLabel(
          factor.confidence
        )}）`
    );
    lines.splice(
      lines.indexOf("### 关联证据"),
      0,
      "### 主要影响因子",
      ...factorLines,
      ""
    );
  }

  // ---- v2：反馈信号 ----
  const signals = attributionData.feedbackSignals || [];
  if (signals.length > 0) {
    const signalLines = signals.slice(0, 5).map(
      (signal) =>
        `- ${signal.date} ${signal.storeId}：${signal.type}（${
          signal.daypart || "全天"
        }/${signal.channel || "全部"}）——${signal.claim} [${
          signal.verified ? "已与数据交叉验证" : "待验证"
        }]`
    );
    lines.splice(
      lines.indexOf("### 运营建议"),
      0,
      "### 店长反馈信号",
      ...signalLines,
      ""
    );
  }

  return lines.join("\n");
}

function sign(value: number): string {
  return value > 0 ? "+" : "";
}

function confidenceLabel(
  confidence: AttributionFactorContribution["confidence"]
): string {
  return confidence === "high" ? "高" : confidence === "medium" ? "中" : "低";
}
