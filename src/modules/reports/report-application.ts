import { DataAccessDeniedError } from "@/modules/admin/permissions/access-control";
import type { AccessControl } from "@/modules/admin/permissions/access-control";
import type { SalesData } from "@/modules/domain/sales-data";
import type { SalesDataRepository } from "@/modules/data-source/sales-data-repository";
import { generateWeeklyReportHTML } from "@/modules/reports/report-engine";
import type { WorkbenchContextApplication } from "@/modules/workbench/workbench-context-application";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";

export interface WeeklyReportRequest {
  userId: string;
  startDate: string;
  endDate: string;
  storeIds?: string[];
}

export interface ReportApplication {
  generate(input: WeeklyReportRequest): Promise<string>;
}

interface ReportApplicationDependencies {
  loadSalesData(): Promise<SalesData>;
  filterSalesData(userId: string, data: SalesData): Promise<Record<string, Array<Record<string, unknown>>>>;
  getContext(user: AuthenticatedUser): ReturnType<WorkbenchContextApplication["getContext"]>;
  findAuthenticatedUser(userId: string): Promise<AuthenticatedUser>;
  generateHTML?: typeof generateWeeklyReportHTML;
}

export function createReportApplication({
  loadSalesData,
  filterSalesData,
  getContext,
  findAuthenticatedUser,
  generateHTML = generateWeeklyReportHTML,
}: ReportApplicationDependencies): ReportApplication {
  return {
    async generate(input) {
      const user = await findAuthenticatedUser(input.userId);
      const context = await getContext(user);
      if (!context.availableIntents.includes("report")) {
        throw new DataAccessDeniedError();
      }
      const requestedStoreIds = input.storeIds ?? context.availableStoreIds;
      if (
        requestedStoreIds.length === 0 ||
        requestedStoreIds.some(
          (storeId) => !context.availableStoreIds.includes(storeId)
        )
      ) {
        throw new DataAccessDeniedError("请求中包含无权访问的门店数据，请联系管理员调整门店范围。");
      }
      const rawData = await loadSalesData();
      const filtered = await filterSalesData(input.userId, rawData);
      return generateHTML(
        filtered as unknown as SalesData,
        input.startDate,
        input.endDate,
        requestedStoreIds
      );
    },
  };
}
