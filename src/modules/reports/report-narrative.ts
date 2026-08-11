import type { WeeklyReportData } from "@/modules/reports/report-model";
import {
  formatReportDateLabel,
  formatReportNumber,
} from "@/modules/reports/report-format";

export function buildReportSummaryParts(data: WeeklyReportData): string[] {
  const topChannel = data.channelBreakdown[0];
  const topCategory = data.categoryBreakdown[0];
  const parts = [
    `<strong>销售表现：</strong>${formatReportDateLabel(
      data.startDate
    )}日-${formatReportDateLabel(
      data.endDate
    )}日 期间，区域总销售额 ¥${formatReportNumber(data.totalSales, {
      currency: true,
    })}元，目标达成率 ${formatReportNumber(data.achievementRate, {
      pct: true,
      dec: 1,
    })}。单日最高销售为 <strong>${data.maxDay.slice(
      5
    )}</strong>（¥${formatReportNumber(data.maxDaySales, {
      currency: true,
    })}元），最低为 <strong>${data.minDay.slice(
      5
    )}</strong>（¥${formatReportNumber(data.minDaySales, {
      currency: true,
    })}元）。`,
    `<strong>客流特征：</strong>周末日均销售 ¥${formatReportNumber(
      data.weekendAvg,
      { currency: true }
    )}元，较工作日${data.weekendVs >= 0 ? "高" : "低"} <strong>${Math.abs(
      data.weekendVs
    ).toFixed(1)}%</strong>。`,
    `<strong>渠道结构：</strong>${topChannel?.name || "N/A"} 为最主要渠道，占比 ${
      topChannel?.pct.toFixed(1) || "0.0"
    }%。`,
    `<strong>品类贡献：</strong>${topCategory?.name || "N/A"} 贡献最大，占比 ${
      topCategory?.pct.toFixed(1) || "0.0"
    }%。`,
  ];

  if (data.anomalies.length > 0) {
    parts.push(
      `<strong>异常关注：</strong>以下日期销售波动较大需深入分析：${data.anomalies
        .map((date) => `<strong>${date.slice(5)}</strong>`)
        .join("、")}。`
    );
  }

  return parts;
}
