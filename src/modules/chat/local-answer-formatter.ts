import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import { formatRegisteredAnalysis } from "@/modules/analysis/analysis-registry";
import { formatSqlWeeklyReport } from "@/modules/reports/sql-report-formatter";

export function formatLocalAnalysis(
  intent: AnalysisIntent,
  data: Record<string, unknown> | null
): string {
  if (!data) return "*没有找到可用于分析的数据。*";
  if (intent === "report") return formatSqlWeeklyReport(data);
  return formatRegisteredAnalysis(intent, data) || "Analysis completed.";
}

export function buildGuideMessage(): string {
  return `抱歉，我是 LuminaX-灵犀经营智能引擎助手，只能回答与门店销售数据相关的问题。

你可以试试这些问题：

- 计算 S001 的销售达成率
- 分析 S002 的订单数变化趋势
- 看一下 S001 的渠道占比
- 计算 S003 的退款率
- 生成上周的周报
- S001 对比 S002
- S002 为什么没达标`;
}

export function buildOutOfScopeMessage(): string {
  return `抱歉，当前本地 POC 仅包含华东1区 5 家门店数据，无法查询其他区域或门店。

当前可查询门店：

- S001 上海商场店
- S002 办公园区店
- S003 大学城店
- S004 地铁站店
- S005 社区中心店`;
}
