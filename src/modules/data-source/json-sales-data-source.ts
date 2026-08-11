import { readFile } from "fs/promises";
import { join } from "path";
import type { SalesData } from "@/modules/domain/sales-data";
import type { SalesDataSource } from "./data-source";

export class JsonSalesDataSource implements SalesDataSource {
  private cachedData: SalesData | null = null;

  async loadSalesData(): Promise<SalesData> {
    if (this.cachedData) return this.cachedData;

    const filePath = join(process.cwd(), "public", "sales_data.json");
    const raw = await readFile(filePath, "utf-8");
    this.cachedData = JSON.parse(raw) as SalesData;
    return this.cachedData;
  }
}
