import type { WeeklyReportData } from "@/modules/reports/report-model";
import { formatNumber } from "@/modules/metrics/core-calculations";

export function renderWeeklyReportMarkdown(data: WeeklyReportData): string {
  const abnormalStores = data.storeRanking
    .filter((store) => store.achievementRate < 1)
    .map((store) => store.storeId);

  let report = `### 周报已生成\n\n`;
  report += `**时间范围**：${data.startDate} 至 ${data.endDate}\n\n`;
  report += `**关键指标**：\n`;
  report += `- 区域总销售额：¥${formatNumber(data.totalSales)}\n`;
  report += `- 目标达成率：${data.summary.salesSummary.achievementRate}\n`;
  report += `- 总订单量：${formatNumber(data.totalOrders)}\n`;
  report += `- 平均客单价：¥${data.avgAOV}\n\n`;

  report += `**门店排名**：\n`;
  data.storeRanking.forEach((store, index) => {
    report += `${index + 1}. ${store.storeName}（${store.storeId}）- ¥${formatNumber(store.totalSales)}（达成率 ${(
      store.achievementRate * 100
    ).toFixed(1)}%）\n`;
  });

  report += `\n**异常提醒**：\n`;
  report +=
    abnormalStores.length > 0
      ? `以下门店未达标：${abnormalStores.join("、")}\n`
      : "所有门店均达标\n";

  report += `\n**渠道分布**：\n`;
  data.channelBreakdown.forEach((item) => {
    report += `- ${item.name}：¥${formatNumber(item.value)}（${item.pct.toFixed(
      1
    )}%）\n`;
  });

  report += `\n**品类分布**：\n`;
  data.categoryBreakdown.forEach((item) => {
    report += `- ${item.name}：¥${formatNumber(item.value)}（${item.pct.toFixed(
      1
    )}%）\n`;
  });

  return report;
}
