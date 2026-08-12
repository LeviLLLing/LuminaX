import type {
  AttributionFactorContribution,
  BenchmarkKind,
} from "@/modules/attribution/attribution-types";
import type {
  AttributionAggregate,
  AttributionDimensionTotals,
  AttributionScope,
} from "@/modules/attribution/benchmark-resolver";
import { round2 } from "@/modules/attribution/decomposition-engine";
import {
  localizeDimensionName,
  localizeFactorName,
  localizeRefundReason,
} from "@/modules/attribution/attribution-labels";

export interface FactorInput {
  scope: AttributionScope;
  storeInfo: Record<string, { storeType: string; openingDate: string }>;
  period: AttributionAggregate;
  benchmark: AttributionAggregate;
  dimensions: {
    period: AttributionDimensionTotals;
    benchmark: AttributionDimensionTotals;
  };
  categoryItems: {
    period: { orders: number; items: number };
    benchmark: { orders: number; items: number };
  };
  refundReasons: Array<{ reason: string; amount: number; orders: number }>;
  benchmarkKind: BenchmarkKind;
  benchmarkLabel: string;
}

type Confidence = AttributionFactorContribution["confidence"];

interface FactorResult {
  factor: string;
  label: string;
  contribution: number;
  direction: AttributionFactorContribution["direction"];
  evidence: string;
  confidence: Confidence;
}

interface FactorDefinition {
  factor: string;
  compute(input: FactorInput): FactorResult | FactorResult[] | null;
}

const FACTOR_DEFINITIONS: FactorDefinition[] = [
  {
    factor: "customer_count",
    compute(input) {
      const { period, benchmark } = input;
      const benchAov = aov(benchmark);
      if (benchmark.customers <= 0 && period.customers > 0) {
        return evidenceOnly("customer_count", "当前基准不含客数数据，无法评估客流贡献");
      }
      if (benchmark.customers <= 0 && period.customers === 0) return null;
      const contribution = round2(
        (period.customers - benchmark.customers) * benchAov
      );
      return {
        factor: "customer_count",
        label: "客流",
        contribution,
        direction: contribution >= 0 ? "up" : "down",
        evidence: `客流 ${benchmark.customers} → ${period.customers} 人，按基准客单价 ${fmt(benchAov)} 折算`,
        confidence: confidenceOf(contribution, input),
      };
    },
  },
  {
    factor: "attach_rate",
    compute(input) {
      const { period, benchmark } = input;
      if (period.customers <= 0 || benchmark.customers <= 0) return null;
      const periodAttach = period.orders / period.customers;
      const benchAttach = benchmark.orders / benchmark.customers;
      const contribution = round2(
        (periodAttach - benchAttach) * benchmark.customers * aov(benchmark)
      );
      return {
        factor: "attach_rate",
        label: "连带率",
        contribution,
        direction: contribution >= 0 ? "up" : "down",
        evidence: `人均下单 ${fmt(benchAttach)} → ${fmt(periodAttach)}`,
        confidence: confidenceOf(contribution, input),
      };
    },
  },
  {
    factor: "items_per_order",
    compute(input) {
      const { period, benchmark, categoryItems } = input;
      const periodPpo = ppo(period, categoryItems.period);
      const benchPpo = ppo(benchmark, categoryItems.benchmark);
      if (periodPpo == null || benchPpo == null) return null;
      const contribution = round2(
        (periodPpo - benchPpo) * benchmark.orders * aov(benchmark)
      );
      return {
        factor: "items_per_order",
        label: "每单件数",
        contribution,
        direction: contribution >= 0 ? "up" : "down",
        evidence: `每单件数 ${fmt(benchPpo)} → ${fmt(periodPpo)}`,
        confidence: confidenceOf(contribution, input),
      };
    },
  },
  {
    factor: "channel_*",
    compute(input) {
      return dimensionFactor(input, "channel", "渠道");
    },
  },
  {
    factor: "daypart_*",
    compute(input) {
      return dimensionFactor(input, "daypart", "时段");
    },
  },
  {
    factor: "category_*",
    compute(input) {
      return dimensionFactor(input, "category", "品类");
    },
  },
  {
    factor: "promo_penetration",
    compute(input) {
      const { period, benchmark } = input;
      if (period.orders <= 0 || benchmark.orders <= 0) return null;
      if (benchmark.promoOrders <= 0 && period.promoOrders > 0) {
        return evidenceOnly(
          "promo_penetration",
          "当前基准不含促销订单数据，无法评估渗透率贡献"
        );
      }
      const periodPen = period.promoOrders / period.orders;
      const benchPen = benchmark.promoOrders / benchmark.orders;
      const contribution = round2(
        (periodPen - benchPen) * benchmark.sales
      );
      return {
        factor: "promo_penetration",
        label: "促销渗透率",
        contribution,
        direction: contribution >= 0 ? "up" : "down",
        evidence: `促销订单渗透率 ${pct(benchPen)} → ${pct(periodPen)}`,
        confidence: confidenceOf(contribution, input),
      };
    },
  },
  {
    factor: "promo_efficiency",
    compute(input) {
      const { period, benchmark } = input;
      if (period.promoOrders <= 0 || period.orders <= 0) return null;
      const promoAov = period.promoSales / period.promoOrders;
      const benchAov = aov(benchmark);
      if (benchAov <= 0) {
        return evidenceOnly(
          "promo_efficiency",
          "当前基准不含客单价数据，无法评估促销效率贡献"
        );
      }
      const contribution = round2((promoAov - benchAov) * period.promoOrders);
      return {
        factor: "promo_efficiency",
        label: "促销效率",
        contribution,
        direction: contribution >= 0 ? "up" : "down",
        evidence: `促销客单 ${fmt(promoAov)} vs 基准客单 ${fmt(benchAov)}`,
        confidence: "low",
      };
    },
  },
  {
    factor: "refund_reason_*",
    compute(input) {
      const { refundReasons } = input;
      if (refundReasons.length === 0) return null;
      const totalRefund = refundReasons.reduce(
        (sum, item) => sum + item.amount,
        0
      );
      return refundReasons.slice(0, 3).map((item) => ({
        factor: `refund_reason_${item.reason}`,
        label: `退款原因·${localizeRefundReason(item.reason)}`,
        contribution: round2(-item.amount),
        direction: "down" as const,
        evidence: `退款原因「${localizeRefundReason(
          item.reason
        )}」金额 ¥${fmt(item.amount)}（占退款总额 ${pct(
          totalRefund > 0 ? item.amount / totalRefund : 0
        )}）`,
        confidence: "medium" as Confidence,
      }));
    },
  },
  {
    factor: "cancel_rate",
    compute(input) {
      const { period, benchmark } = input;
      if (period.orders <= 0 || benchmark.orders <= 0) return null;
      if (benchmark.cancelled <= 0 && period.cancelled > 0) {
        return evidenceOnly(
          "cancel_rate",
          "当前基准不含取消订单数据，无法评估取消率贡献"
        );
      }
      const periodCancel = period.cancelled / period.orders;
      const benchCancel = benchmark.cancelled / benchmark.orders;
      const contribution = round2(
        (periodCancel - benchCancel) * benchmark.sales
      );
      return {
        factor: "cancel_rate",
        label: "取消率",
        contribution,
        direction: contribution >= 0 ? "down" : "up",
        evidence: `取消率 ${pct(benchCancel)} → ${pct(periodCancel)}`,
        confidence: confidenceOf(contribution, input),
      };
    },
  },
  {
    factor: "maturity",
    compute(input) {
      const ages = Object.values(input.storeInfo)
        .map((info) => ageInYears(info.openingDate))
        .filter((age) => age != null);
      if (ages.length === 0) return null;
      const minAge = Math.min(...ages);
      return {
        factor: "maturity",
        label: "门店成熟度",
        contribution: 0,
        direction: "flat",
        evidence: `门店已开业最短约 ${minAge} 年，新老店差异可能影响达成基准`,
        confidence: "low",
      };
    },
  },
];

export function computeFactorContributions(
  input: FactorInput
): AttributionFactorContribution[] {
  const results: AttributionFactorContribution[] = [];
  for (const definition of FACTOR_DEFINITIONS) {
    const computed = definition.compute(input);
    if (!computed) continue;
    const items = Array.isArray(computed) ? computed : [computed];
    for (const item of items) {
      results.push({
        factor: item.factor,
        label: item.label,
        contribution: item.contribution,
        direction: item.direction,
        benchmark: input.benchmarkLabel,
        evidence: item.evidence,
        confidence: item.confidence,
      });
    }
  }
  return results
    .filter((item) => item.contribution !== 0 || item.confidence === "low")
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 8);
}

function dimensionFactor(
  input: FactorInput,
  dimension: "channel" | "daypart" | "category",
  label: string
): FactorResult[] | null {
  const periodMap = input.dimensions.period[dimension];
  const benchmarkMap = input.dimensions.benchmark[dimension];
  // 基准无该维度结构时无法计算缺口贡献，跳过（避免把绝对值当作贡献）
  if (Object.keys(benchmarkMap).length === 0) return null;
  const names = new Set([
    ...Object.keys(periodMap),
    ...Object.keys(benchmarkMap),
  ]);
  if (names.size === 0) return null;
  return [...names].map((name) => {
    const contribution = round2(
      (periodMap[name] || 0) - (benchmarkMap[name] || 0)
    );
    const localizedName = localizeDimensionName(dimension, name);
    return {
      factor: `${dimension}_${name}`,
      label: `${label}·${localizedName}`,
      contribution,
      direction: contribution >= 0 ? ("up" as const) : ("down" as const),
      evidence: `${label}「${localizedName}」${fmt(benchmarkMap[name] || 0)} → ${fmt(
        periodMap[name] || 0
      )}`,
      confidence: confidenceOf(contribution, input),
    };
  });
}

function confidenceOf(
  contribution: number,
  input: FactorInput
): Confidence {
  const totalGap = Math.abs(input.period.sales - input.benchmark.sales);
  const ratio = totalGap > 0 ? Math.abs(contribution) / totalGap : 0;
  if (ratio >= 0.15) return "high";
  if (ratio >= 0.05) return "medium";
  return "low";
}

function evidenceOnly(factor: string, evidence: string): FactorResult {
  return {
    factor,
    label: localizeFactorName(factor),
    contribution: 0,
    direction: "flat",
    evidence,
    confidence: "low",
  };
}

function aov(aggregate: AttributionAggregate): number {
  return aggregate.orders > 0 ? aggregate.sales / aggregate.orders : 0;
}

function ppo(
  aggregate: AttributionAggregate,
  items: { orders: number; items: number }
): number | null {
  return items.orders > 0 ? items.items / items.orders : null;
}

function ageInYears(openingDate: string): number | null {
  if (!openingDate) return null;
  const parsed = Date.parse(openingDate);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, (Date.now() - parsed) / (365.25 * 86_400_000));
}

function fmt(value: number): string {
  return value.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
  });
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
