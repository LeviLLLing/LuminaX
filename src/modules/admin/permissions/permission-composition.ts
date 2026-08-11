import { RepositoryAccessControl } from "./access-control";
import { createPermissionAdminApplication } from "./permission-admin-application";
import { FilePermissionRepository } from "./permission-repository";

export const permissionRepository = new FilePermissionRepository();
export const accessControl = new RepositoryAccessControl(permissionRepository);
export const permissionAdminApplication = createPermissionAdminApplication(
  permissionRepository,
  accessControl
);

