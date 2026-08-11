import { randomUUID } from "node:crypto";
import type { AccessControl } from "./access-control";
import {
  PERMISSION_DATA_CATALOG,
  PERMISSION_STORES,
  findPermissionTable,
  isPermissionStoreId,
  isPermissionTableName,
} from "./permission-data-catalog";
import {
  SYSTEM_ADMIN_USER_ID,
  type PermissionRepository,
} from "./permission-repository";
import {
  PERMISSION_USER_ROLES,
  PERMISSION_USER_STATUSES,
  type AccessDecision,
  type PermissionUser,
  type PermissionUserInput,
  type TableAccessPolicy,
} from "./permission-types";

export class PermissionAdminError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "SYSTEM_USER",
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "PermissionAdminError";
  }
}

export interface PermissionAdminSnapshot {
  users: PermissionUser[];
  catalog: typeof PERMISSION_DATA_CATALOG;
  stores: typeof PERMISSION_STORES;
}

export interface PermissionAdminApplication {
  list(): Promise<PermissionAdminSnapshot>;
  saveUser(input: PermissionUserInput): Promise<PermissionUser>;
  setStatus(id: string, status: "active" | "disabled"): Promise<PermissionUser>;
  remove(id: string): Promise<boolean>;
  evaluate(
    userId: string,
    tableName: string,
    columnName: string,
    storeId: string
  ): Promise<AccessDecision>;
}

export function createPermissionAdminApplication(
  repository: PermissionRepository,
  accessControl: AccessControl,
  now: () => Date = () => new Date()
): PermissionAdminApplication {
  return {
    async list() {
      return {
        users: await repository.list(),
        catalog: PERMISSION_DATA_CATALOG,
        stores: PERMISSION_STORES,
      };
    },

    async saveUser(rawInput) {
      const input = normalizeInput(rawInput);
      const existing = input.id
        ? await repository.findByIdOrUsername(input.id)
        : null;
      if (input.id && !existing) {
        throw new PermissionAdminError("NOT_FOUND", "用户不存在。");
      }
      if (existing?.system) {
        throw new PermissionAdminError(
          "SYSTEM_USER",
          "系统管理员不能被编辑。"
        );
      }

      const timestamp = now().toISOString();
      try {
        return await repository.save({
          ...input,
          id: existing?.id || input.id || randomUUID(),
          system: false,
          createdAt: existing?.createdAt || timestamp,
          updatedAt: timestamp,
        });
      } catch (error) {
        throw new PermissionAdminError(
          "INVALID_INPUT",
          error instanceof Error ? error.message : "保存用户失败。",
          { cause: error }
        );
      }
    },

    async setStatus(id, status) {
      if (!PERMISSION_USER_STATUSES.includes(status)) {
        throw new PermissionAdminError("INVALID_INPUT", "用户状态无效。");
      }
      const user = await repository.findByIdOrUsername(id);
      if (!user) throw new PermissionAdminError("NOT_FOUND", "用户不存在。");
      if (user.system) {
        throw new PermissionAdminError(
          "SYSTEM_USER",
          "系统管理员不能被停用。"
        );
      }
      return repository.save({
        ...user,
        status,
        updatedAt: now().toISOString(),
      });
    },

    async remove(id) {
      if (id === SYSTEM_ADMIN_USER_ID) {
        throw new PermissionAdminError(
          "SYSTEM_USER",
          "系统管理员不能被删除。"
        );
      }
      const removed = await repository.remove(id);
      if (!removed) throw new PermissionAdminError("NOT_FOUND", "用户不存在。");
      return true;
    },

    evaluate(userId, tableName, columnName, storeId) {
      if (!isPermissionTableName(tableName)) {
        throw new PermissionAdminError("INVALID_INPUT", "数据表无效。");
      }
      const table = findPermissionTable(tableName);
      if (!table?.columns.includes(columnName as never)) {
        throw new PermissionAdminError("INVALID_INPUT", "字段无效。");
      }
      if (!isPermissionStoreId(storeId)) {
        throw new PermissionAdminError("INVALID_INPUT", "门店值无效。");
      }
      return accessControl.evaluate(userId, tableName, columnName, storeId);
    },
  };
}

function normalizeInput(input: PermissionUserInput): PermissionUserInput {
  const username = input.username?.trim();
  const displayName = input.displayName?.trim();
  if (!username || !/^[a-zA-Z][a-zA-Z0-9._-]{2,63}$/.test(username)) {
    throw new PermissionAdminError(
      "INVALID_INPUT",
      "用户名需以字母开头，长度为 3 至 64 位。"
    );
  }
  if (!displayName || displayName.length > 50) {
    throw new PermissionAdminError(
      "INVALID_INPUT",
      "显示名称长度需为 1 至 50 个字符。"
    );
  }
  if (!PERMISSION_USER_ROLES.includes(input.role)) {
    throw new PermissionAdminError("INVALID_INPUT", "用户角色无效。");
  }
  if (!PERMISSION_USER_STATUSES.includes(input.status)) {
    throw new PermissionAdminError("INVALID_INPUT", "用户状态无效。");
  }

  return {
    id: input.id,
    username,
    displayName,
    role: input.role,
    status: input.status,
    policies: normalizePolicies(input.policies || []),
  };
}

function normalizePolicies(policies: TableAccessPolicy[]): TableAccessPolicy[] {
  const seen = new Set<string>();
  return policies.map((policy) => {
    if (!isPermissionTableName(policy.tableName) || seen.has(policy.tableName)) {
      throw new PermissionAdminError(
        "INVALID_INPUT",
        "数据表权限重复或包含无效数据表。"
      );
    }
    seen.add(policy.tableName);
    const table = findPermissionTable(policy.tableName);
    const allowedColumns = [...new Set(policy.allowedColumns || [])];
    const allowedStoreIds = [...new Set(policy.allowedStoreIds || [])];
    if (
      allowedColumns.length === 0 ||
      allowedColumns.some(
        (column) => !table?.columns.includes(column as never)
      )
    ) {
      throw new PermissionAdminError(
        "INVALID_INPUT",
        `${policy.tableName} 至少需要选择一个有效字段。`
      );
    }
    if (
      allowedStoreIds.length === 0 ||
      allowedStoreIds.some((storeId) => !isPermissionStoreId(storeId))
    ) {
      throw new PermissionAdminError(
        "INVALID_INPUT",
        `${policy.tableName} 至少需要选择一个有效门店。`
      );
    }
    return { tableName: policy.tableName, allowedColumns, allowedStoreIds };
  });
}

