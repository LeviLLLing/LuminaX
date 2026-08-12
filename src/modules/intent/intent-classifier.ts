import type { AnalysisIntent } from "@/modules/domain/analysis-types";
import {
  DEFAULT_END_DATE,
  DEFAULT_START_DATE,
  DOMAIN_KEYWORDS,
  OUT_OF_SCOPE_KEYWORDS,
  STORE_NAME_TO_ID,
} from "@/modules/domain/constants";

export interface IntentResult {
  intent: AnalysisIntent;
  storeIds: string[];
  startDate: string | null;
  endDate: string | null;
  relevant: boolean;
  outOfScope: boolean;
}

export function classifyIntent(question: string): IntentResult {
  const q = question.toLowerCase();
  const dateRange = extractDateRange(question);

  const mentionedStoreIds = [...question.matchAll(/S(\d{3})/gi)].map(
    (match) => `S${match[1]}`
  );
  const hasInvalidStore = mentionedStoreIds.some(
    (id) => !Object.values(STORE_NAME_TO_ID).includes(id)
  );
  const outOfScope =
    hasInvalidStore || OUT_OF_SCOPE_KEYWORDS.some((kw) => question.includes(kw));

  if (outOfScope) {
    return {
      intent: "irrelevant",
      storeIds: [],
      startDate: dateRange.start,
      endDate: dateRange.end,
      relevant: true,
      outOfScope: true,
    };
  }

  const storeIds = extractStoreIds(question);
  const relevant =
    DOMAIN_KEYWORDS.some((kw) => q.includes(kw.toLowerCase())) ||
    storeIds.length > 0;

  if (!relevant) {
    return {
      intent: "irrelevant",
      storeIds: [],
      startDate: dateRange.start,
      endDate: dateRange.end,
      relevant: false,
      outOfScope: false,
    };
  }

  let intent: AnalysisIntent = "achievement_rate";
  if (q.includes("周报") || q.includes("报告")) intent = "report";
  else if (q.includes("对比") || q.includes("比较") || q.includes("vs")) intent = "compare";
  else if (q.includes("为什么") || q.includes("归因") || q.includes("原因")) intent = "attribution";
  else if (q.includes("订单") && (q.includes("趋势") || q.includes("变化") || q.includes("走势"))) intent = "order_trend";
  else if (q.includes("客单价") || q.includes("aov")) intent = "aov_trend";
  else if (q.includes("渠道") || q.includes("占比")) intent = "channel_mix";
  else if (q.includes("时段") || q.includes("早餐") || q.includes("午餐") || q.includes("下午茶") || q.includes("晚餐")) intent = "daypart_analysis";
  else if (q.includes("促销") || q.includes("优惠")) intent = "promotion_contribution";
  else if (q.includes("退款") || q.includes("取消")) intent = "refund_rate";
  else if (q.includes("异常") || q.includes("波动")) intent = "anomaly_detection";

  return {
    intent,
    storeIds,
    startDate: dateRange.start,
    endDate: dateRange.end,
    relevant: true,
    outOfScope: false,
  };
}

export function extractStoreIds(question: string): string[] {
  const ids = new Set<string>();

  for (const match of question.matchAll(/S(\d{3})/gi)) {
    const id = `S${match[1]}`;
    if (Object.values(STORE_NAME_TO_ID).includes(id)) ids.add(id);
  }

  for (const [name, id] of Object.entries(STORE_NAME_TO_ID)) {
    if (question.includes(name)) ids.add(id);
  }

  return Array.from(ids);
}

export function extractDateRange(question: string): { start: string | null; end: string | null } {
  const isoDates = [...question.matchAll(/20\d{2}-\d{2}-\d{2}/g)].map(
    (match) => match[0]
  );
  if (isoDates.length >= 2) return { start: isoDates[0], end: isoDates[1] };
  if (isoDates.length === 1) return { start: isoDates[0], end: isoDates[0] };

  const monthDayDates = [
    ...question.matchAll(/(?:(\d{4})年)?\s*(\d{1,2})月(\d{1,2})(?:日|号)/g),
  ].map((match) => {
    const year = match[1] || "2025";
    const month = match[2].padStart(2, "0");
    const day = match[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  if (monthDayDates.length >= 2) {
    return { start: monthDayDates[0], end: monthDayDates[1] };
  }
  if (monthDayDates.length === 1) {
    return { start: monthDayDates[0], end: monthDayDates[0] };
  }

  if (question.includes("上周") || question.includes("本周")) {
    return { start: DEFAULT_START_DATE, end: DEFAULT_END_DATE };
  }

  return { start: null, end: null };
}
