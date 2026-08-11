import type {
  CustomMetricDefinition,
  MetricQueryResult,
  MetricQueryScope,
} from "./metric-definition";
import type { MetricDefinitionRepository } from "./metric-definition-repository";
import type { MetricQueryRunner } from "./metric-query-runner";

export interface CustomMetricExecution {
  metric: Pick<
    CustomMetricDefinition,
    "id" | "code" | "name" | "description" | "unit" | "precision"
  >;
  result: MetricQueryResult;
}

export interface CustomMetricRuntime {
  match(question: string): Promise<CustomMetricDefinition | null>;
  execute(
    metricId: string,
    scope: MetricQueryScope
  ): Promise<CustomMetricExecution>;
}

export class RegisteredCustomMetricRuntime implements CustomMetricRuntime {
  constructor(
    private readonly repository: MetricDefinitionRepository,
    private readonly queryRunner: MetricQueryRunner
  ) {}

  async match(question: string): Promise<CustomMetricDefinition | null> {
    const normalizedQuestion = normalizeMatchText(question);
    const metrics = (await this.repository.list()).filter(
      (metric) => metric.status === "published"
    );

    const matches = metrics.flatMap((metric) => {
      const terms = [metric.name, metric.code, ...metric.aliases]
        .map(normalizeMatchText)
        .filter((term) => term.length >= 2);
      const score = Math.max(
        0,
        ...terms
          .filter((term) => normalizedQuestion.includes(term))
          .map((term) => term.length)
      );
      return score > 0 ? [{ metric, score }] : [];
    });

    matches.sort((left, right) => right.score - left.score);
    return matches[0]?.metric || null;
  }

  async execute(
    metricId: string,
    scope: MetricQueryScope
  ): Promise<CustomMetricExecution> {
    const metric = await this.repository.findById(metricId);
    if (!metric || metric.status !== "published") {
      throw new Error("自定义指标不存在或尚未发布。");
    }
    const result = await this.queryRunner.run(metric.sqlTemplate, scope);
    return {
      metric: {
        id: metric.id,
        code: metric.code,
        name: metric.name,
        description: metric.description,
        unit: metric.unit,
        precision: metric.precision,
      },
      result,
    };
  }
}

function normalizeMatchText(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}
