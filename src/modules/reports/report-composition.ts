import { accessControl, permissionRepository } from "@/modules/admin/permissions/permission-composition";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import { salesDataRepository } from "@/modules/data-source/sales-data-repository";
import { createReportApplication } from "@/modules/reports/report-application";
import { workbenchContextApplication } from "@/modules/workbench/workbench-composition";

export const reportApplication = createReportApplication({
  loadSalesData: () => salesDataRepository.loadSalesData(),
  filterSalesData: (userId, data) =>
    accessControl.filterSalesData(userId, data),
  authorizeScope: (request) => accessControl.authorizeScope(request),
  getContext: (user) => workbenchContextApplication.getContext(user),
  async findAuthenticatedUser(userId) {
    const user = await permissionRepository.findByIdOrUsername(userId);
    if (!user || user.status !== "active") {
      throw new Error("Authenticated user not found");
    }
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    } satisfies AuthenticatedUser;
  },
});
