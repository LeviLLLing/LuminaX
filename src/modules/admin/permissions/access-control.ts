import type { SalesData } from "@/modules/domain/sales-data";
import {
  findPermissionTable,
  isPermissionStoreId,
} from "./permission-data-catalog";
import type { PermissionRepository } from "./permission-repository";
import type {
  AccessDecision,
  AccessScope,
  AccessScopeRequest,
  DataAccessRequirement,
  PermissionUser,
} from "./permission-types";

export interface AccessControl {
  authorizeScope(request: AccessScopeRequest): Promise<AccessScope>;
  evaluate(
    userId: string,
    tableName: string,
    columnName: string,
    storeId: string
  ): Promise<AccessDecision>;
  filterSalesData(
    userId: string,
    salesData: SalesData
  ): Promise<Record<string, Array<Record<string, unknown>>>>;
}

export class DataAccessDeniedError extends Error {
  constructor(
    message = "当前账号没有权限访问该指标所需的数据，请联系管理员补充相关数据表、字段或门店权限。"
  ) {
    super(message);
    this.name = "DataAccessDeniedError";
  }
}

export class RepositoryAccessControl implements AccessControl {
  constructor(private readonly repository: PermissionRepository) {}

  async authorizeScope({
    userId,
    requirements,
    requestedStoreIds,
    availableStoreIds,
    strictStoreScope,
  }: AccessScopeRequest): Promise<AccessScope> {
    const user = await this.requireActiveUser(userId);
    const available = unique(availableStoreIds).filter(isPermissionStoreId);
    const requested = unique(requestedStoreIds).filter((storeId) =>
      available.includes(storeId)
    );

    if (user.role === "super_admin") {
      return { storeIds: requested.length > 0 ? requested : available };
    }

    const normalizedRequirements = mergeRequirements(requirements);
    let permittedStores = [...available];
    for (const requirement of normalizedRequirements) {
      const policy = user.policies.find(
        (item) => item.tableName === requirement.tableName
      );
      if (!policy) throw new DataAccessDeniedError();
      if (
        requirement.columns.some(
          (column) => !policy.allowedColumns.includes(column)
        )
      ) {
        throw new DataAccessDeniedError();
      }
      permittedStores = permittedStores.filter((storeId) =>
        policy.allowedStoreIds.includes(storeId)
      );
    }

    if (strictStoreScope && requested.some((id) => !permittedStores.includes(id))) {
      throw new DataAccessDeniedError(
        "请求中包含无权访问的门店数据，请联系管理员调整门店范围。"
      );
    }

    const storeIds = requested.length > 0
      ? requested.filter((id) => permittedStores.includes(id))
      : permittedStores;
    if (storeIds.length === 0) throw new DataAccessDeniedError();
    return { storeIds };
  }

  async evaluate(
    userId: string,
    tableName: string,
    columnName: string,
    storeId: string
  ): Promise<AccessDecision> {
    const user = await this.repository.findByIdOrUsername(userId);
    if (!user) return { allowed: false, reason: "用户不存在。" };
    if (user.status !== "active") {
      return { allowed: false, reason: "用户已停用。" };
    }
    if (user.role === "super_admin") {
      return { allowed: true, reason: "系统管理员拥有全部数据权限。" };
    }

    const policy = user.policies.find((item) => item.tableName === tableName);
    if (!policy) return { allowed: false, reason: "未授予数据表访问权限。" };
    if (!policy.allowedColumns.includes(columnName)) {
      return { allowed: false, reason: "未授予字段访问权限。" };
    }
    if (!policy.allowedStoreIds.includes(storeId)) {
      return { allowed: false, reason: "未授予该门店数据权限。" };
    }
    return { allowed: true, reason: "表、字段和门店范围均已授权。" };
  }

  async filterSalesData(
    userId: string,
    salesData: SalesData
  ): Promise<Record<string, Array<Record<string, unknown>>>> {
    const user = await this.requireActiveUser(userId);
    if (user.role === "super_admin") {
      return salesData as unknown as Record<
        string,
        Array<Record<string, unknown>>
      >;
    }

    return Object.fromEntries(
      Object.entries(salesData).map(([tableName, rows]) => {
        const table = findPermissionTable(tableName);
        const policy = user.policies.find(
          (item) => item.tableName === tableName
        );
        if (!table || !policy) return [tableName, []];

        const allowedColumns = new Set(policy.allowedColumns);
        const allowedStores = new Set(policy.allowedStoreIds);
        const filteredRows = (rows as Array<Record<string, unknown>>)
          .filter((row) => allowedStores.has(String(row.store_id || "")))
          .map((row) =>
            Object.fromEntries(
              Object.entries(row).filter(([column]) =>
                allowedColumns.has(column)
              )
            )
          );
        return [tableName, filteredRows];
      })
    );
  }

  private async requireActiveUser(userId: string): Promise<PermissionUser> {
    const user = await this.repository.findByIdOrUsername(userId);
    if (!user || user.status !== "active") throw new DataAccessDeniedError();
    return user;
  }
}

export const allowAllAccessControl: AccessControl = {
  async authorizeScope(request) {
    const requested = request.requestedStoreIds.filter((storeId) =>
      request.availableStoreIds.includes(storeId)
    );
    return {
      storeIds:
        requested.length > 0 ? requested : [...request.availableStoreIds],
    };
  },
  async evaluate() {
    return { allowed: true, reason: "测试访问控制允许全部数据。" };
  },
  async filterSalesData(_userId, salesData) {
    return salesData as unknown as Record<
      string,
      Array<Record<string, unknown>>
    >;
  },
};

function mergeRequirements(
  requirements: DataAccessRequirement[]
): DataAccessRequirement[] {
  const merged = new Map<string, Set<string>>();
  for (const requirement of requirements) {
    const columns = merged.get(requirement.tableName) || new Set<string>();
    requirement.columns.forEach((column) => columns.add(column));
    merged.set(requirement.tableName, columns);
  }
  return [...merged].map(([tableName, columns]) => ({
    tableName,
    columns: [...columns],
  }));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
