import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CustomMetricDefinition } from "./metric-definition";

interface MetricRegistryFile {
  version: 1;
  metrics: CustomMetricDefinition[];
}

export interface MetricDefinitionRepository {
  list(): Promise<CustomMetricDefinition[]>;
  findById(id: string): Promise<CustomMetricDefinition | null>;
  save(metric: CustomMetricDefinition): Promise<CustomMetricDefinition>;
  remove(id: string): Promise<boolean>;
}

export class FileMetricDefinitionRepository
  implements MetricDefinitionRepository
{
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath =
      process.env.LUMINAX_METRIC_REGISTRY_PATH ||
      join(process.cwd(), ".luminax", "metric-registry.json")
  ) {}

  async list(): Promise<CustomMetricDefinition[]> {
    const registry = await this.readRegistry();
    return registry.metrics.map(cloneMetric);
  }

  async findById(id: string): Promise<CustomMetricDefinition | null> {
    const metrics = await this.list();
    return metrics.find((metric) => metric.id === id) || null;
  }

  async save(metric: CustomMetricDefinition): Promise<CustomMetricDefinition> {
    return this.withWriteLock(async () => {
      const registry = await this.readRegistry();
      const code = metric.code.toLowerCase();
      const conflict = registry.metrics.find(
        (item) => item.id !== metric.id && item.code.toLowerCase() === code
      );
      if (conflict) {
        throw new Error(`指标编码 ${metric.code} 已存在。`);
      }

      const index = registry.metrics.findIndex((item) => item.id === metric.id);
      if (index >= 0) registry.metrics[index] = cloneMetric(metric);
      else registry.metrics.push(cloneMetric(metric));
      registry.metrics.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      );
      await this.writeRegistry(registry);
      return cloneMetric(metric);
    });
  }

  async remove(id: string): Promise<boolean> {
    return this.withWriteLock(async () => {
      const registry = await this.readRegistry();
      const nextMetrics = registry.metrics.filter((metric) => metric.id !== id);
      if (nextMetrics.length === registry.metrics.length) return false;
      await this.writeRegistry({ version: 1, metrics: nextMetrics });
      return true;
    });
  }

  private async readRegistry(): Promise<MetricRegistryFile> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as Partial<MetricRegistryFile>;
      return {
        version: 1,
        metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, metrics: [] };
      }
      throw error;
    }
  }

  private async writeRegistry(registry: MetricRegistryFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      `${JSON.stringify(registry, null, 2)}\n`,
      "utf8"
    );
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

function cloneMetric(metric: CustomMetricDefinition): CustomMetricDefinition {
  return structuredClone(metric);
}
