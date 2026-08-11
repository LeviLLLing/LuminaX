export const PERMISSION_USER_ROLES = ["manager", "analyst"] as const;
export const PERMISSION_USER_STATUSES = ["active", "disabled"] as const;

export type PermissionUserRole =
  | "super_admin"
  | (typeof PERMISSION_USER_ROLES)[number];
export type PermissionUserStatus =
  (typeof PERMISSION_USER_STATUSES)[number];

export interface TableAccessPolicy {
  tableName: string;
  allowedColumns: string[];
  allowedStoreIds: string[];
}

export interface PermissionUser {
  id: string;
  username: string;
  displayName: string;
  role: PermissionUserRole;
  status: PermissionUserStatus;
  system: boolean;
  policies: TableAccessPolicy[];
  createdAt: string;
  updatedAt: string;
}

export interface PermissionUserInput {
  id?: string;
  username: string;
  displayName: string;
  role: (typeof PERMISSION_USER_ROLES)[number];
  status: PermissionUserStatus;
  policies: TableAccessPolicy[];
}

export interface DataAccessRequirement {
  tableName: string;
  columns: string[];
}

export interface AccessDecision {
  allowed: boolean;
  reason: string;
}

export interface AccessScope {
  storeIds: string[];
}

export interface AccessScopeRequest {
  userId: string;
  requirements: DataAccessRequirement[];
  requestedStoreIds: string[];
  availableStoreIds: string[];
  strictStoreScope: boolean;
}

