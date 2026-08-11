import { buildReportAlerts } from "@/modules/reports/report-alerts";
import { buildReportChartScripts } from "@/modules/reports/report-chart-scripts";
import type {
  WeeklyReportBreakdownItem,
  WeeklyReportData,
} from "@/modules/reports/report-model";
import { formatReportNumber } from "@/modules/reports/report-format";
import { buildReportSummaryParts } from "@/modules/reports/report-narrative";
import { WEEKLY_REPORT_STYLES } from "@/modules/reports/report-styles";

export function renderWeeklyReportHtml(data: WeeklyReportData): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>门店区域经理周报</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"><\/script>
<style>${WEEKLY_REPORT_STYLES}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>门店区域经理周报</h1>
    <div class="meta">数据周期: ${data.startDate} 至 ${data.endDate} | 门店数: ${data.storeCount} | 生成时间: ${data.generatedTime}</div>
  </div>
  <div class="content">
    <div class="section">
      <h2>区域整体经营概览</h2>
      <div class="kpi-grid">
        ${renderKpi("区域总销售额", `¥${formatReportNumber(data.totalSales, { currency: true })}`)}
        ${renderKpi("目标达成率", formatReportNumber(data.achievementRate, { pct: true, dec: 1 }))}
        ${renderKpi("总订单量", formatReportNumber(data.totalOrders, { dec: 0 }))}
        ${renderKpi("平均客单价", `¥${data.avgAOV}`)}
        ${renderKpi("退款率", formatReportNumber(data.refundRate, { pct: true, dec: 2 }))}
        ${renderKpi("促销销售占比", formatReportNumber(data.promoRate, { pct: true, dec: 1 }))}
      </div>
    </div>
    <div class="section">
      <h2>经营趋势总结</h2>
      <div class="summary-box">${buildReportSummaryParts(data).join("<br><br>")}</div>
    </div>
    <div class="section">
      <h2>需关注信息</h2>
      ${renderAlerts(data)}
    </div>
    <div class="section">
      <h2>销售 & 订单 & 客单价趋势</h2>
      <div class="chart-row">
        <div class="chart-col">
          <div class="chart-title">销售额趋势（含目标）</div>
          <div class="chart-container" id="salesTrend"></div>
        </div>
        <div class="chart-col">
          <div class="chart-title">订单量趋势</div>
          <div class="chart-container" id="orderTrend"></div>
        </div>
      </div>
      <div class="chart-row">
        <div class="chart-col">
          <div class="chart-title">客单价变化</div>
          <div class="chart-container" id="aovTrend"></div>
        </div>
        <div class="chart-col">
          <div class="chart-title">渠道销售趋势</div>
          <div class="chart-container" id="channelTrend"></div>
        </div>
      </div>
    </div>
    <div class="section">
      <h2>门店排名与对比</h2>
      <div class="chart-row">
        <div class="chart-col" style="min-width:100%;">
          <div class="chart-title">各门店销售达成对比</div>
          <div class="chart-container" id="storeCompare"></div>
        </div>
      </div>
      ${renderStoreRankingTable(data)}
    </div>
    <div style="display:flex;gap:20px;">
      <div class="section" style="flex:1;">
        <h2>渠道结构</h2>
        ${renderBreakdownBars(data.channelBreakdown, true)}
      </div>
      <div class="section" style="flex:1;">
        <h2>时段分布</h2>
        ${renderBreakdownBars(data.daypartBreakdown)}
      </div>
    </div>
    <div class="section">
      <h2>品类贡献</h2>
      ${renderBreakdownBars(data.categoryBreakdown)}
    </div>
    <div class="section">
      <h2>退款分析</h2>
      ${renderRefundTable(data)}
    </div>
  </div>
  <div class="footer">*免责声明: 本报表基于数据分析生成，具体经营决策请结合现场实际情况。</div>
</div>
${buildReportChartScripts(data)}
</body>
</html>`;
}

function renderKpi(label: string, value: string): string {
  return `<div class="kpi-card"><div class="kpi-value">${value}</div><div class="kpi-label">${label}</div></div>`;
}

function renderAlerts(data: WeeklyReportData): string {
  return buildReportAlerts(data)
    .map(
      (alert) =>
        `<div class="alert alert-${alert.tone}"><strong>${alert.title}：</strong>${alert.message}</div>`
    )
    .join("");
}

function renderBreakdownBars(
  items: WeeklyReportBreakdownItem[],
  showValue = false
): string {
  return items
    .map((item) => {
      const valueLabel = showValue
        ? ` (¥${formatReportNumber(item.value, { currency: true })})`
        : "";
      return `<div style="display:flex;align-items:center;margin:4px 0;font-size:12px;">
        <div style="width:100px;text-align:right;padding-right:8px;color:#555;">${item.name}</div>
        <div style="flex:1;background:#eee;border-radius:4px;height:16px;position:relative;">
          <div style="background:#FFE600;height:100%;border-radius:4px;width:${item.pct}%;"></div>
        </div>
        <div style="margin-left:8px;font-weight:600;">${item.pct.toFixed(1)}%${valueLabel}</div>
      </div>`;
    })
    .join("");
}

function renderStoreRankingTable(data: WeeklyReportData): string {
  const rows = data.storeRanking
    .map((store, index) => {
      const rowStyle =
        index === 0
          ? 'style="background:#fff8e1"'
          : index === data.storeRanking.length - 1
            ? 'style="background:#ffebee"'
            : "";
      const tagClass =
        store.achievementRate >= 1
          ? "tag-up"
          : store.achievementRate >= 0.95
            ? "tag-warn"
            : "tag-down";
      const tagText =
        store.achievementRate >= 1
          ? "达标"
          : store.achievementRate >= 0.95
            ? "接近"
            : "未达标";
      return `<tr ${rowStyle}>
        <td>${index + 1}</td>
        <td>${store.storeName}</td>
        <td>¥${formatReportNumber(store.totalSales, { currency: true })}</td>
        <td>¥${formatReportNumber(store.totalTarget, { currency: true })}</td>
        <td>${formatReportNumber(store.achievementRate, { pct: true, dec: 1 })} <span class="tag ${tagClass}">${tagText}</span></td>
        <td>${formatReportNumber(store.orders, { dec: 0 })}</td>
        <td>¥${store.avgAOV.toFixed(0)}</td>
        <td>¥${formatReportNumber(store.refund, { currency: true })}</td>
      </tr>`;
    })
    .join("");

  return `<table>
    <thead><tr><th>排名</th><th>门店</th><th>实际销售</th><th>目标</th><th>达成率</th><th>订单量</th><th>客单价</th><th>退款金额</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderRefundTable(data: WeeklyReportData): string {
  const rows = data.refundReasons
    .map(
      (row) =>
        `<tr><td>${row.reason}</td><td>¥${formatReportNumber(row.amount, { currency: true })}</td><td>${row.orders}</td></tr>`
    )
    .join("");

  return `<table>
    <thead><tr><th>主要原因</th><th>退款金额</th><th>退款单数</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}
