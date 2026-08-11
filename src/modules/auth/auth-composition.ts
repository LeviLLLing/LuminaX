import { permissionRepository } from "@/modules/admin/permissions/permission-composition";
import { createAuthApplication } from "./auth-application";
import { FileCredentialRepository } from "./credential-repository";
import { LoginAttemptLimiter } from "./login-attempt-limiter";
import { SessionManager } from "./session-manager";

export const credentialRepository = new FileCredentialRepository();
export const sessionManager = new SessionManager();
export const authApplication = createAuthApplication(
  permissionRepository,
  credentialRepository,
  sessionManager
);
export const loginAttemptLimiter = new LoginAttemptLimiter();

