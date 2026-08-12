import type {
  AttributionData,
  BenchmarkKind,
} from "@/modules/attribution/attribution-types";
import type {
  AttributionAggregate,
  AttributionDimensionTotals,
  AttributionScope,
} from "@/modules/attribution/benchmark-resolver";
import {
  computeDecomposition,
  computeDimensionContributions,
} from "@/modules/attribution/decomposition-engine";
import {
  computeFactorContributions,
  type FactorInput,
} from "@/modules/attribution/factor-registry";
import {
  computeFeedbackSignals,
  type FeedbackInputRow,
} from "@/modules/attribution/feedback-signals";

export interface EnrichmentInput {
  scope: AttributionScope;
  benchmarkKind: BenchmarkKind;
  benchmarkLabel: string;
  benchmarkWindow: { start: string; end: string } | null;
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
  feedbackRows: FeedbackInputRow[];
  storeInfo: Record<string, { storeType: string; openingDate: string }>;
}

/**
 * 在基础 AttributionData 之上追加 v2 字段：
 * requestId / benchmark / decomposition / factorContributions / feedbackSignals。
 * JS 引擎与 SQL 执行器共用此函数，保证口径一致。
 */
export function enrichAttributionV2(
  base: AttributionData,
  input: EnrichmentInput
): AttributionData {
  const decomposition = computeDecomposition(input.period, input.benchmark);
  // 基准无结构数据（target / SQL 路径的 historical）时不做维度拆分，
  // 避免把绝对值当作缺口贡献
  const hasBenchmarkStructure =
    Object.keys(input.dimensions.benchmark.channel).length > 0 ||
    Object.keys(input.dimensions.benchmark.daypart).length > 0 ||
    Object.keys(input.dimensions.benchmark.category).length > 0;
  decomposition.dimensionContributions = hasBenchmarkStructure
    ? computeDimensionContributions(
        input.dimensions.period,
        input.dimensions.benchmark
      )
    : [];

  const factorInput: FactorInput = {
    scope: input.scope,
    storeInfo: input.storeInfo,
    period: input.period,
    benchmark: input.benchmark,
    dimensions: input.dimensions,
    categoryItems: input.categoryItems,
    refundReasons: input.refundReasons,
    benchmarkKind: input.benchmarkKind,
    benchmarkLabel: input.benchmarkLabel,
  };
  const factors = computeFactorContributions(factorInput);
  const feedbackSignals = computeFeedbackSignals(input.feedbackRows, factors);

  return {
    ...base,
    requestId: createRequestId(),
    benchmark: {
      type: input.benchmarkKind,
      label: input.benchmarkLabel,
      window: input.benchmarkWindow,
    },
    decomposition,
    factorContributions: factors,
    feedbackSignals,
  };
}

function createRequestId(): string {
  return `attr-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
