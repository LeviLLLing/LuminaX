import { money, num, pct } from "@/modules/chat/answer-formatters/format-utils";

interface SqlReportData {
  dateRange: { start: string; end: string };
  summary: {
    storeCount: number;
    totalSales: number;
    totalTarget: number;
    achievementRate: number;
    totalOrders: number;
    avgAOV: number;
    totalRefund: number;
    refundRate: number;
    totalCancelled: number;
    totalPromo: number;
    promoRate: number;
  };
  storeRanking: Array<{
    storeId: string;
    storeName: string;
    totalSales: number;
    totalTarget: number;
    achievementRate: number;
    salesRank: number;
  }>;
  dailyTrend: Array<{
    date: string;
    sales: number;
    salesRankDesc: number;
    salesRankAsc: number;
    isAnomaly: number;
    weekendAvg: number;
    weekdayAvg: number;
    weekendVs: number;
  }>;
  channelBreakdown: Array<{
    dimensionName: string;
    value: number;
    pct: number;
  }>;
  categoryBreakdown: Array<{
    dimensionName: string;
    value: number;
    pct: number;
  }>;
}

export function formatSqlWeeklyReport(
  data: Record<string, unknown>
): string {
  const report = data as unknown as SqlReportData;
  const topChannel = report.channelBreakdown[0];
  const topCategory = report.categoryBreakdown[0];
  const highestDay = report.dailyTrend.find((day) => day.salesRankDesc === 1);
  const lowestDay = report.dailyTrend.find((day) => day.salesRankAsc === 1);
  const trendReference = report.dailyTrend[0];
  const anomalies = report.dailyTrend.filter((day) => day.isAnomaly === 1);

  return [
    `## 经营周报（${report.dateRange.start} 至 ${report.dateRange.end}）`,
    "",
    `覆盖 ${num(report.summary.storeCount)} 家门店，销售额 **${money(report.summary.totalSales)}**，目标 **${money(report.summary.totalTarget)}**，达成率 **${pct(report.summary.achievementRate)}**。`,
    `订单量 ${num(report.summary.totalOrders)}，平均客单价 ${money(report.summary.avgAOV)}；退款率 ${pct(report.summary.refundRate)}，促销销售占比 ${pct(report.summary.promoRate)}。`,
    "",
    "### 门店表现",
    "| 排名 | 门店 | 销售额 | 目标 | 达成率 |",
    "|---:|---|---:|---:|---:|",
    ...report.storeRanking.map(
      (store) =>
        `| ${store.salesRank} | ${store.storeName}（${store.storeId}） | ${money(store.totalSales)} | ${money(store.totalTarget)} | ${pct(store.achievementRate)} |`
    ),
    "",
    "### 结构与波动",
    `- 最高销售日：${highestDay?.date || "无数据"}${highestDay ? `，${money(highestDay.sales)}` : ""}`,
    `- 最低销售日：${lowestDay?.date || "无数据"}${lowestDay ? `，${money(lowestDay.sales)}` : ""}`,
    `- 主要渠道：${topChannel?.dimensionName || "无数据"}${topChannel ? `，占比 ${pct(topChannel.pct)}` : ""}`,
    `- 主要品类：${topCategory?.dimensionName || "无数据"}${topCategory ? `，占比 ${pct(topCategory.pct)}` : ""}`,
    trendReference
      ? `- 周末相对工作日销售变化：${pct(trendReference.weekendVs)}`
      : "- 周末相对工作日销售变化：无数据",
    anomalies.length > 0
      ? `- 异常日期：${anomalies.map((day) => day.date).join("、")}`
      : "- 异常日期：未检测到明显波动",
  ].join("\n");
}
