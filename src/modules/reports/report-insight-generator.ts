import { z } from "zod";
import type { AgentModel } from "@/modules/agents/shared/agent-model";
import { extractJsonObject } from "@/modules/agents/shared/prompt-utils";
import { buildReportAlerts } from "@/modules/reports/report-alerts";
import type {
  ReportAttentionItem,
  ReportInsights,
  WeeklyReportData,
} from "@/modules/reports/report-model";
import { buildReportSummaryParts } from "@/modules/reports/report-narrative";

const attentionItemSchema = z.object({
  severity: z.enum(["high", "medium", "low", "positive"]),
  title: z.string().trim().min(1),
  evidence: z.string().trim().min(1),
  action: z.string().trim().min(1),
});

const insightSchema = z.object({
  trendSummary: z.array(z.string().trim().min(1)).min(4),
  attentionItems: z.array(attentionItemSchema).min(1),
});

const REPORT_INSIGHT_SYSTEM_PROMPT = `你是 LuminaX 周报洞察生成器。只根据输入的聚合经营数据生成分析，不得创造、改写或重新计算任何数值。无法由数据直接支持的因果判断必须写明“建议进一步核查”。只输出严格 JSON：{"trendSummary":["4至6条经营判断"],"attentionItems":[{"severity":"high|medium|low|positive","title":"标题","evidence":"数据依据","action":"可执行建议"}]}。不得输出 Markdown 或额外说明。`;

export async function generateReportInsights(
  data: WeeklyReportData,
  model: AgentModel
): Promise<ReportInsights> {
  const promptPayload = toPromptPayload(data);

  try {
    const response = await model.complete({
      systemPrompt: REPORT_INSIGHT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: JSON.stringify(promptPayload),
        },
      ],
      temperature: 0.2,
    });
    const parsed = response ? extractJsonObject(response) : null;
    const result = insightSchema.safeParse(parsed);
    if (
      !result.success ||
      !hasOnlySupportedNumericClaims(result.data, promptPayload)
    ) {
      return buildFallbackInsights(data);
    }

    return {
      trendSummary: result.data.trendSummary.slice(0, 6),
      attentionItems: result.data.attentionItems.slice(0, 5),
      source: "ai",
    };
  } catch {
    return buildFallbackInsights(data);
  }
}

function hasOnlySupportedNumericClaims(
  insights: z.infer<typeof insightSchema>,
  promptPayload: ReturnType<typeof toPromptPayload>
): boolean {
  const allowed = new Set(extractNumericTokens(JSON.stringify(promptPayload)));
  collectNumbers(promptPayload).forEach((value) => {
    for (let precision = 0; precision <= 2; precision += 1) {
      allowed.add(normalizeNumericToken(value.toFixed(precision)));
    }
    if (Math.abs(value) <= 2) {
      for (let precision = 0; precision <= 2; precision += 1) {
        allowed.add(
          normalizeNumericToken(`${(value * 100).toFixed(precision)}%`)
        );
      }
    }
    if (Math.abs(value) >= 10_000) {
      for (let precision = 0; precision <= 2; precision += 1) {
        allowed.add(
          normalizeNumericToken(`${(value / 10_000).toFixed(precision)}万`)
        );
      }
    }
  });

  const output = [
    ...insights.trendSummary,
    ...insights.attentionItems.flatMap((item) => [
      item.title,
      item.evidence,
      item.action,
    ]),
  ].join("\n");

  return extractNumericTokens(output).every((token) => allowed.has(token));
}

function collectNumbers(value: unknown): number[] {
  if (typeof value === "number") return Number.isFinite(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(collectNumbers);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectNumbers);
  }
  return [];
}

function extractNumericTokens(value: string): string[] {
  return (value.match(/\d[\d,]*(?:\.\d+)?(?:%|万)?/g) ?? []).map(
    normalizeNumericToken
  );
}

function normalizeNumericToken(token: string): string {
  const suffix = token.endsWith("%") || token.endsWith("万") ? token.at(-1) : "";
  const numericPart = token.replace(/[,%万]/g, "");
  const numericValue = Number(numericPart);
  return Number.isFinite(numericValue) ? `${numericValue}${suffix}` : token;
}

function toPromptPayload(data: WeeklyReportData) {
  return {
    startDate: data.startDate,
    endDate: data.endDate,
    storeCount: data.storeCount,
    totalSales: data.totalSales,
    totalTarget: data.totalTarget,
    achievementRate: data.achievementRate,
    totalOrders: data.totalOrders,
    avgAOV: data.avgAOV,
    totalRefund: data.totalRefund,
    refundRate: data.refundRate,
    totalCancel: data.totalCancel,
    totalPromo: data.totalPromo,
    promoRate: data.promoRate,
    dateLabels: data.dateLabels,
    salesTrend: data.salesTrend,
    targetTrend: data.targetTrend,
    orderTrend: data.orderTrend,
    aovTrend: data.aovTrend,
    channelSeries: data.channelSeries,
    storeRanking: data.storeRanking,
    channelBreakdown: data.channelBreakdown,
    categoryBreakdown: data.categoryBreakdown,
    daypartBreakdown: data.daypartBreakdown,
    refundReasons: data.refundReasons,
    anomalies: data.anomalies,
    weekendAvg: data.weekendAvg,
    weekdayAvg: data.weekdayAvg,
    weekendVs: data.weekendVs,
    maxDay: data.maxDay,
    maxDaySales: data.maxDaySales,
    minDay: data.minDay,
    minDaySales: data.minDaySales,
  };
}

function buildFallbackInsights(data: WeeklyReportData): ReportInsights {
  return {
    trendSummary: buildReportSummaryParts(data),
    attentionItems: buildReportAlerts(data).map<ReportAttentionItem>((alert) => ({
      severity: alert.tone === "danger" ? "high" : "positive",
      title: alert.title,
      evidence: alert.message,
      action: alert.message,
    })),
    source: "fallback",
  };
}
