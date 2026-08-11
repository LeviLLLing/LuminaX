import type { SalesData } from "@/modules/domain/sales-data";
import { createSalesDataSource } from "@/modules/data-source/data-source-factory";
import type { SalesDataSource } from "@/modules/data-source/data-source";

export class SalesDataRepository {
  constructor(private readonly dataSource: SalesDataSource) {}

  loadSalesData(): Promise<SalesData> {
    return this.dataSource.loadSalesData();
  }
}

export const salesDataRepository = new SalesDataRepository(
  createSalesDataSource()
);
