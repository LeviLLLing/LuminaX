import type { WeeklyReportData } from "@/modules/reports/report-model";
import { formatReportNumber } from "@/modules/reports/report-format";

export interface ReportAlert {
  tone: "danger" | "success";
  title: string;
  message: string;
}

export function buildReportAlerts(data: WeeklyReportData): ReportAlert[] {
  const alerts: ReportAlert[] = [];

  if (data.achievementRate < 0.95) {
    alerts.push({
      tone: "danger",
      title: "整体目标未达标",
      message: `区域整体达成率 ${formatReportNumber(data.achievementRate, {
        pct: true,
        dec: 1,
      })}，低于 95% 警戒线，需重点推动后进门店。`,
    });
  }

  const worstStore = data.storeRanking[data.storeRanking.length - 1];
  if (worstStore && worstStore.achievementRate < 0.9) {
    alerts.push({
      tone: "danger",
      title: "尾部门店风险",
      message: `${worstStore.storeName} 达成率仅 ${formatReportNumber(
        worstStore.achievementRate,
        { pct: true, dec: 1 }
      )}，建议立即开展专项帮扶。`,
    });
  }

  if (data.refundRate > 0.02) {
    alerts.push({
      tone: "danger",
      title: "退款率偏高",
      message: `区域整体退款率 ${formatReportNumber(data.refundRate, {
        pct: true,
        dec: 2,
      })}，建议优化出品流程。`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      tone: "success",
      title: "运营良好",
      message: "当前区域整体指标正常，建议持续关注周末客流及促销 ROI 变化。",
    });
  }

  return alerts;
}
