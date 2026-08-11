import { randomUUID } from "node:crypto";
import type { MetricSqlAuthoringAgent } from "@/modules/agents/metric-authoring/metric-sql-authoring-agent";
import {
  METRIC_CATEGORIES,
  METRIC_SOURCE_TABLES,
  METRIC_UNITS,
  type CustomMetricDefinition,
  type MetricDefinitionInput,
  type MetricQueryResult,
  type MetricQueryScope,
  type MetricSqlDraft,
  type MetricSqlValidation,
  type RegisteredMetricDefinition,
} from "./metric-definition";
import type { MetricDefinitionRepository } from "./metric-definition-repository";
import type { MetricQueryRunner } from "./metric-query-runner";
import { validateMetricSqlTemplate } from "./metric-sql-template";
import { SYSTEM_METRIC_DEFINITIONS } from "./system-metric-catalog";

export class MetricAdminError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "AUTHORING_UNAVAILABLE"
      | "VALIDATION_FAILED"
      | "TEST_FAILED",
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "MetricAdminError";
  }
}

export interface PublishedMetricResult {
  metric: CustomMetricDefinition;
  testResult: MetricQueryResult;
}

export interface MetricAdminApplication {
  list(): Promise<RegisteredMetricDefinition[]>;
  generateSql(input: MetricDefinitionInput): Promise<MetricSqlDraft>;
  saveDraft(input: MetricDefinitionInput): Promise<CustomMetricDefinition>;
  validateSql(
    sqlTemplate: string,
    requestedTables?: string[]
  ): MetricSqlValidation;
  testSql(
    sqlTemplate: string,
    scope: MetricQueryScope,
    requestedTables?: string[]
  ): Promise<MetricQueryResult>;
  publish(
    input: MetricDefinitionInput,
    scope: MetricQueryScope
  ): Promise<PublishedMetricResult>;
  disable(id: string): Promise<CustomMetricDefinition>;
  remove(id: string): Promise<boolean>;
}

export function createMetricAdminApplication(
  repository: MetricDefinitionRepository,
  queryRunner: MetricQueryRunner,
  authoringAgent: MetricSqlAuthoringAgent,
  now: () => Date = () => new Date()
): MetricAdminApplication {
  const validateWithTables = (
    sqlTemplate: string,
    requestedTables?: string[]
  ): MetricSqlValidation => {
    const validation = validateMetricSqlTemplate(sqlTemplate);
    if (!requestedTables || !validation.valid) return validation;
    const unexpectedTables = validation.tables.filter(
      (table) => !requestedTables.includes(table)
    );
    if (unexpectedTables.length === 0) return validation;
    return {
      ...validation,
      valid: false,
      errors: [
        ...validation.errors,
        `SQL 使用了未选择的数据表：${unexpectedTables.join("、")}。`,
      ],
    };
  };

  return {
    async list() {
      const customMetrics = await repository.list();
      return [...SYSTEM_METRIC_DEFINITIONS, ...customMetrics];
    },

    async generateSql(rawInput) {
      const input = normalizeInput(rawInput, true);
      let generated;
      try {
        generated = await authoringAgent.generate(input);
      } catch (error) {
        throw new MetricAdminError(
          "AUTHORING_UNAVAILABLE",
          "AI 生成 SQL 超时或暂时不可用，请稍后重试或手动填写 SQL。",
          { cause: error }
        );
      }
      return {
        ...generated,
        validation: validateWithTables(
          generated.sqlTemplate,
          input.requestedTables
        ),
      };
    },

    async saveDraft(rawInput) {
      const input = normalizeInput(rawInput, true);
      await assertCodeAvailable(input, repository);
      const existing = input.id
        ? await repository.findById(input.id)
        : null;
      if (input.id && !existing) {
        throw new MetricAdminError("NOT_FOUND", "自定义指标不存在。");
      }

      const timestamp = now().toISOString();
      const sqlChanged = existing?.sqlTemplate !== input.sqlTemplate;
      const metric: CustomMetricDefinition = {
        ...input,
        id: existing?.id || input.id || randomUUID(),
        origin: "custom",
        status: sqlChanged ? "draft" : existing?.status || "draft",
        validation: sqlChanged ? null : existing?.validation || null,
        createdAt: existing?.createdAt || timestamp,
        updatedAt: timestamp,
        publishedAt: sqlChanged ? null : existing?.publishedAt || null,
      };
      return repository.save(metric);
    },

    validateSql(sqlTemplate, requestedTables) {
      return validateWithTables(sqlTemplate, requestedTables);
    },

    async testSql(sqlTemplate, scope, requestedTables) {
      const validation = validateWithTables(sqlTemplate, requestedTables);
      if (!validation.valid) {
        throw new MetricAdminError(
          "VALIDATION_FAILED",
          validation.errors.join(" ")
        );
      }
      try {
        return await queryRunner.run(sqlTemplate, scope);
      } catch (error) {
        throw new MetricAdminError("TEST_FAILED", "SQL 试运行失败。", {
          cause: error,
        });
      }
    },

    async publish(rawInput, scope) {
      const input = normalizeInput(rawInput, false);
      const saved = await this.saveDraft(input);
      const validation = validateWithTables(
        saved.sqlTemplate,
        saved.requestedTables
      );
      if (!validation.valid) {
        throw new MetricAdminError(
          "VALIDATION_FAILED",
          validation.errors.join(" ")
        );
      }

      const testResult = await this.testSql(
        saved.sqlTemplate,
        scope,
        saved.requestedTables
      );
      assertMetricResult(testResult);
      const timestamp = now().toISOString();
      const metric = await repository.save({
        ...saved,
        status: "published",
        validation: {
          validatedAt: timestamp,
          tables: validation.tables,
          outputColumns: validation.outputColumns,
          sampleRowCount: testResult.rowCount,
        },
        updatedAt: timestamp,
        publishedAt: timestamp,
      });
      return { metric, testResult };
    },

    async disable(id) {
      const metric = await repository.findById(id);
      if (!metric) throw new MetricAdminError("NOT_FOUND", "自定义指标不存在。");
      return repository.save({
        ...metric,
        status: "disabled",
        updatedAt: now().toISOString(),
      });
    },

    remove(id) {
      return repository.remove(id);
    },
  };
}

function normalizeInput(
  input: MetricDefinitionInput,
  allowEmptySql: boolean
): MetricDefinitionInput {
  const code = input.code?.trim().toLowerCase();
  const name = input.name?.trim();
  const description = input.description?.trim();
  const sqlTemplate = input.sqlTemplate?.trim() || "";
  if (!code || !/^[a-z][a-z0-9_]{2,63}$/.test(code)) {
    throw new MetricAdminError(
      "INVALID_INPUT",
      "指标编码需以小写字母开头，仅包含小写字母、数字和下划线。"
    );
  }
  if (!name || name.length > 50) {
    throw new MetricAdminError("INVALID_INPUT", "指标名称长度应为 1 到 50 个字符。");
  }
  if (!description || description.length > 500) {
    throw new MetricAdminError("INVALID_INPUT", "请填写 1 到 500 个字符的计算口径。");
  }
  if (!METRIC_CATEGORIES.includes(input.category)) {
    throw new MetricAdminError("INVALID_INPUT", "指标分类无效。");
  }
  if (!METRIC_UNITS.includes(input.unit)) {
    throw new MetricAdminError("INVALID_INPUT", "指标单位无效。");
  }
  if (!Number.isInteger(input.precision) || input.precision < 0 || input.precision > 6) {
    throw new MetricAdminError("INVALID_INPUT", "指标精度必须是 0 到 6 的整数。");
  }
  if (
    !Array.isArray(input.requestedTables) ||
    input.requestedTables.length === 0 ||
    !input.requestedTables.every((table) => METRIC_SOURCE_TABLES.includes(table))
  ) {
    throw new MetricAdminError("INVALID_INPUT", "请至少选择一张有效数据表。");
  }
  if (!allowEmptySql && !sqlTemplate) {
    throw new MetricAdminError("INVALID_INPUT", "发布前必须生成或填写 SQL。");
  }

  return {
    id: input.id,
    code,
    name,
    description,
    aliases: [...new Set((input.aliases || []).map((alias) => alias.trim()).filter(Boolean))].slice(0, 12),
    category: input.category,
    unit: input.unit,
    precision: input.precision,
    requestedTables: [...new Set(input.requestedTables)],
    sqlTemplate,
  };
}

async function assertCodeAvailable(
  input: MetricDefinitionInput,
  repository: MetricDefinitionRepository
): Promise<void> {
  if (SYSTEM_METRIC_DEFINITIONS.some((metric) => metric.code === input.code)) {
    throw new MetricAdminError("INVALID_INPUT", "指标编码与系统指标重复。");
  }
  const conflict = (await repository.list()).find(
    (metric) => metric.id !== input.id && metric.code === input.code
  );
  if (conflict) throw new MetricAdminError("INVALID_INPUT", "指标编码已存在。");
}

function assertMetricResult(result: MetricQueryResult): void {
  if (result.rowCount === 0) {
    throw new MetricAdminError("TEST_FAILED", "试运行没有返回数据，不能发布指标。");
  }
  const invalidRow = result.rows.find((row) => {
    const value = row.metric_value;
    return typeof value !== "number" || !Number.isFinite(value);
  });
  if (invalidRow) {
    throw new MetricAdminError(
      "TEST_FAILED",
      "metric_value 必须在每一行返回有限数值。"
    );
  }
}
