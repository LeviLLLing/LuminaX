import type { SalesData } from "@/modules/domain/sales-data";

export type SalesDataSourceKind = "json" | "mysql" | "sqlserver";

export interface DatabaseConnectionConfig {
  host: string;
  port?: number;
  database: string;
  username: string;
  password: string;
}

export interface SalesDataSource {
  loadSalesData(): Promise<SalesData>;
}
