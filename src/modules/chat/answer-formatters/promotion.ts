import { money, num, pct } from "@/modules/chat/answer-formatters/format-utils";

export function formatPromotionContribution(
  data: Record<string, unknown>
): string {
  const details = data.promotionDetails as Array<{
    promotionName: string;
    discountAmount: number;
    promoUnits: number;
    discountPct: number;
  }>;
  const totalSales = data.totalSales as number;
  const totalDiscount = data.totalDiscount as number;
  const contributionRate = data.contributionRate as number;

  return [
    `促销相关销售额为 **${money(totalDiscount)}**，占总销售额 ${money(totalSales)} 的 **${pct(contributionRate)}**。`,
    "",
    "| 促销活动 | 促销销售额 | 促销订单量 | 销售占比 |",
    "|---|---:|---:|---:|",
    ...details.map(
      (detail) =>
        `| ${detail.promotionName} | ${money(detail.discountAmount)} | ${num(detail.promoUnits)} | ${pct(detail.discountPct)} |`
    ),
  ].join("\n");
}
