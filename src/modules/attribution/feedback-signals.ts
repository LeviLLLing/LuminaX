import type {
  AttributionFactorContribution,
  FeedbackSignal,
} from "@/modules/attribution/attribution-types";
import {
  localizeFeedbackDetail,
  localizeFeedbackType,
} from "@/modules/attribution/attribution-labels";

export interface FeedbackInputRow {
  date: string;
  storeId: string;
  type: string;
  detail: string;
  daypart: string;
  channel: string;
}

const NEGATIVE_WORDS = [
  "shortage",
  "understaffed",
  "dropped",
  "rain",
  "delay",
  "issue",
  "out of stock",
  "sick",
  "disrupt",
  "不足",
  "下滑",
  "延迟",
  "缺货",
  "影响",
  "大雨",
];

const POSITIVE_WORDS = [
  "stable",
  "strong",
  "boost",
  "exceeded",
  "healthy",
  "正常",
  "稳定",
  "提升",
  "超预期",
];

const INTERNAL_TYPES = new Set(["Staffing", "Product Supply"]);

export function computeFeedbackSignals(
  feedbackRows: FeedbackInputRow[],
  factors: AttributionFactorContribution[]
): FeedbackSignal[] {
  return feedbackRows.map((row) => {
    const direction = detectDirection(row.type, row.detail);
    const controllable = INTERNAL_TYPES.has(row.type);
    const verified = verifyAgainstFactors(row, factors, direction);
    return {
      date: row.date,
      storeId: row.storeId,
      type: localizeFeedbackType(row.type),
      daypart: row.daypart,
      channel: row.channel,
      direction,
      controllable,
      claim: localizeFeedbackDetail(row.detail),
      verified,
      confidence: verified ? "high" : "medium",
    };
  });
}

function detectDirection(
  type: string,
  detail: string
): FeedbackSignal["direction"] {
  const text = `${type} ${detail}`.toLowerCase();
  const hasNegative = NEGATIVE_WORDS.some((word) => text.includes(word));
  const hasPositive = POSITIVE_WORDS.some((word) => text.includes(word));
  if (hasNegative && !hasPositive) return "negative";
  if (hasPositive && !hasNegative) return "positive";
  return "neutral";
}

function verifyAgainstFactors(
  row: FeedbackInputRow,
  factors: AttributionFactorContribution[],
  direction: FeedbackSignal["direction"]
): boolean {
  if (direction === "neutral") return false;
  const targetDirection = direction === "negative" ? "down" : "up";
  return factors.some((factor) => {
    if (factor.direction !== targetDirection) return false;
    const name = factor.factor.toLowerCase();
    if (row.daypart && name === `daypart_${row.daypart.toLowerCase()}`) {
      return true;
    }
    if (row.channel && name === `channel_${row.channel.toLowerCase()}`) {
      return true;
    }
    return false;
  });
}
