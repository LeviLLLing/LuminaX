import {
  getCustomMetricAccessRequirements,
  FIXED_METRIC_ACCESS_REQUIREMENTS,
} from "@/modules/admin/permissions/metric-access-requirements";
import { DataAccessDeniedError } from "@/modules/admin/permissions/access-control";
import { SYSTEM_METRIC_DEFINITIONS } from "@/modules/admin/metrics/system-metric-catalog";
import type { MetricDefinitionRepository } from "@/modules/admin/metrics/metric-definition-repository";
import type { PermissionRepository } from "@/modules/admin/permissions/permission-repository";
import type {
  DataAccessRequirement,
  PermissionUser,
} from "@/modules/admin/permissions/permission-types";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import type { SqlMetricIntent } from "@/modules/metrics/sql-metric-query-executor";
import { resolveWorkbenchTemplate } from "./workbench-templates";
import type {
  WorkbenchContext,
  WorkbenchIntent,
} from "./workbench-types";

export interface WorkbenchContextDependencies {
  permissionRepository: PermissionRepository;
  metricRepository: MetricDefinitionRepository;
  listStoreIds(): Promise<string[]>;
}

export interface WorkbenchContextApplication {
  getContext(user: AuthenticatedUser): Promise<WorkbenchContext>;
}

export function createWorkbenchContextApplication({
  permissionRepository,
  metricRepository,
  listStoreIds,
}: WorkbenchContextDependencies): WorkbenchContextApplication {
  return {
    async getContext(authenticatedUser) {
      const permissionUser = await findActivePermissionUser(
        permissionRepository,
        authenticatedUser
      );
      const template = resolveWorkbenchTemplate(permissionUser.role);
      const databaseStoreIds = unique(await listStoreIds());
      const publishedCustomMetrics = (await metricRepository.list()).filter(
        (metric) => metric.status === "published"
      );

      if (permissionUser.role === "super_admin") {
        return {
          templateId: template.id,
          availableStoreIds: databaseStoreIds,
          availableMetricCodes: unique([
            ...SYSTEM_METRIC_DEFINITIONS.map((metric) => metric.code),
            ...publishedCustomMetrics.map((metric) => metric.code),
          ]),
          availableIntents: template.intentOrder.filter(
            (intent) =>
              intent !== "custom_metric" || publishedCustomMetrics.length > 0
          ),
          canAccessAdmin: true,
        };
      }

      const availableStoreIds = databaseStoreIds.filter((storeId) =>
        permissionUser.policies.some((policy) =>
          policy.allowedStoreIds.includes(storeId)
        )
      );
      const availableFixedMetrics = SYSTEM_METRIC_DEFINITIONS.filter(
        (metric) => {
          const requirements = fixedMetricRequirements(metric.code);
          return (
            requirements !== null &&
            hasMetricAccess(permissionUser, requirements, databaseStoreIds)
          );
        }
      );
      const availableCustomMetrics = publishedCustomMetrics.filter((metric) =>
        hasMetricAccess(
          permissionUser,
          getCustomMetricAccessRequirements(metric),
          databaseStoreIds
        )
      );
      const fixedIntents = new Set<WorkbenchIntent>(
        availableFixedMetrics.map(
          (metric) => metric.code as SqlMetricIntent
        )
      );

      return {
        templateId: template.id,
        availableStoreIds,
        availableMetricCodes: unique([
          ...availableFixedMetrics.map((metric) => metric.code),
          ...availableCustomMetrics.map((metric) => metric.code),
        ]),
        availableIntents: template.intentOrder.filter((intent) =>
          intent === "custom_metric"
            ? availableCustomMetrics.length > 0
            : fixedIntents.has(intent)
        ),
        canAccessAdmin: false,
      };
    },
  };
}

async function findActivePermissionUser(
  repository: PermissionRepository,
  authenticatedUser: AuthenticatedUser
): Promise<PermissionUser> {
  const byId = await repository.findByIdOrUsername(authenticatedUser.id);
  const user =
    byId ||
    (await repository.findByIdOrUsername(authenticatedUser.username));
  if (!user || user.status !== "active") throw new DataAccessDeniedError();
  return user;
}

function fixedMetricRequirements(
  code: string
): DataAccessRequirement[] | null {
  return code in FIXED_METRIC_ACCESS_REQUIREMENTS
    ? FIXED_METRIC_ACCESS_REQUIREMENTS[code as SqlMetricIntent]
    : null;
}

function hasMetricAccess(
  user: PermissionUser,
  requirements: DataAccessRequirement[],
  databaseStoreIds: string[]
): boolean {
  if (requirements.length === 0) return false;
  let commonStoreIds = [...databaseStoreIds];

  for (const requirement of requirements) {
    const policy = user.policies.find(
      (candidate) => candidate.tableName === requirement.tableName
    );
    if (
      !policy ||
      requirement.columns.some(
        (column) => !policy.allowedColumns.includes(column)
      )
    ) {
      return false;
    }
    commonStoreIds = commonStoreIds.filter((storeId) =>
      policy.allowedStoreIds.includes(storeId)
    );
  }

  return commonStoreIds.length > 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
