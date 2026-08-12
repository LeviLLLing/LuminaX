import type {
  AttributionDecomposition,
  AttributionDimensionContribution,
} from "@/modules/attribution/attribution-types";
import type {
  AttributionAggregate,
  AttributionDimensionTotals,
} from "@/modules/attribution/benchmark-resolver";

/**
 * 缺口分解引擎：
 * Δ销售额 = Δ订单量 × 基准客单价 + Δ客单价 × 基准订单量 + 交互项
 * 且三部分之和与 Δ销售额 完全相等（自洽校验）。
 */
export function computeDecomposition(
  period: AttributionAggregate,
  benchmark: AttributionAggregate
): AttributionDecomposition {
  const totalGap = round2(period.sales - benchmark.sales);
  const benchAov = benchmark.orders > 0 ? benchmark.sales / benchmark.orders : 0;
  const benchOrders = benchmark.orders;
  const periodAov = period.orders > 0 ? period.sales / period.orders : 0;

  const orderVolumeGap = round2((period.orders - benchOrders) * benchAov);
  const rawAovGap = round2((periodAov - benchAov) * benchOrders);
  // 交互项取余数，保证分解严格自洽（避免浮点误差导致对不上）
  const interaction = round2(totalGap - orderVolumeGap - rawAovGap);

  return {
    totalGap,
    orderVolumeGap,
    aovGap: rawAovGap,
    interaction,
    dimensionContributions: [],
  };
}

/**
 * 维度贡献分解：需要基准具备结构数据（渠道/时段/品类）时才可计算。
 * 目标基准、SQL 路径的 historical 基准无结构数据，返回空数组。
 */
export function computeDimensionContributions(
  period: AttributionDimensionTotals,
  benchmark: AttributionDimensionTotals
): AttributionDimensionContribution[] {
  const contributions: AttributionDimensionContribution[] = [];

  for (const dimension of ["channel", "daypart", "category"] as const) {
    const periodMap = period[dimension];
    const benchmarkMap = benchmark[dimension];
    const names = new Set([
      ...Object.keys(periodMap),
      ...Object.keys(benchmarkMap),
    ]);
    for (const name of names) {
      const contribution = round2(
        (periodMap[name] || 0) - (benchmarkMap[name] || 0)
      );
      if (Math.abs(contribution) < 0.5) continue;
      contributions.push({ dimension, name, contribution, share: 0 });
    }
  }

  const magnitude = contributions.reduce(
    (sum, item) => sum + Math.abs(item.contribution),
    0
  );
  for (const item of contributions) {
    item.share = magnitude > 0 ? round2(Math.abs(item.contribution) / magnitude) : 0;
  }

  return contributions.sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
  );
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
