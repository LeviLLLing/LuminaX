import type {
  DatabaseConnectionConfig,
  SalesDataSource,
} from "@/modules/data-source/data-source";
import type { SalesData } from "@/modules/domain/sales-data";

export class SqlServerSalesDataSource implements SalesDataSource {
  constructor(private readonly config: DatabaseConnectionConfig) {}

  async loadSalesData(): Promise<SalesData> {
    throw new Error(
      `SQL Server 数据源 Adapter 已预留，但尚未启用实际驱动。请为 ${this.config.host}/${this.config.database} 补充查询实现。`
    );
  }
}
