import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { PermissionRepository } from "@/modules/admin/permissions/permission-repository";
import type { PermissionUser } from "@/modules/admin/permissions/permission-types";
import type { CredentialRepository } from "./credential-repository";
import {
  hashPassword,
  isAcceptablePassword,
  verifyPassword,
} from "./password-hasher";
import type { AuthenticatedUser, LoginResult } from "./auth-types";
import type { SessionManager } from "./session-manager";

const DEFAULT_ADMIN_PASSWORD = "LuminaX";

export class AuthError extends Error {
  constructor(
    public readonly code:
      | "INVALID_CREDENTIALS"
      | "INVALID_PASSWORD"
      | "CREDENTIAL_REQUIRED",
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AuthError";
  }
}

export interface AuthApplication {
  login(username: string, password: string): Promise<LoginResult>;
  authenticateSession(token?: string): Promise<AuthenticatedUser | null>;
  syncCredential(user: PermissionUser, password?: string): Promise<void>;
  removeCredential(userId: string): Promise<void>;
  hasCredential(userId: string): Promise<boolean>;
  assertPasswordAcceptable(password: string): void;
}

export function createAuthApplication(
  permissionRepository: PermissionRepository,
  credentialRepository: CredentialRepository,
  sessionManager: SessionManager,
  now: () => Date = () => new Date()
): AuthApplication {
  const savePassword = async (
    user: PermissionUser,
    password: string
  ): Promise<string> => {
    assertPasswordAcceptable(password);
    const existing = await credentialRepository.findByUserId(user.id);
    const timestamp = now().toISOString();
    const hashed = await hashPassword(password);
    const credential = await credentialRepository.save({
      userId: user.id,
      username: user.username,
      ...hashed,
      version: randomUUID(),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    });
    return credential.updatedAt;
  };

  return {
    async login(username, password) {
      const user = await permissionRepository.findByIdOrUsername(username);
      if (!user || user.status !== "active") throw invalidCredentials();

      let credential = await credentialRepository.findByUserId(user.id);
      if (!credential && user.system) {
        const defaultPassword =
          process.env.LUMINAX_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
        if (!constantTimeTextEqual(password, defaultPassword)) {
          throw invalidCredentials();
        }
        await savePassword(user, password);
        credential = await credentialRepository.findByUserId(user.id);
      }

      if (
        !credential ||
        !(await verifyPassword(
          password,
          credential.salt,
          credential.passwordHash
        ))
      ) {
        throw invalidCredentials();
      }

      const session = await sessionManager.issue(
        user.id,
        credential.version
      );
      return {
        user: toAuthenticatedUser(user),
        token: session.token,
        expiresAt: session.expiresAt,
      };
    },

    async authenticateSession(token) {
      if (!token) return null;
      const session = await sessionManager.verify(token);
      if (!session) return null;
      const user = await permissionRepository.findByIdOrUsername(
        session.userId
      );
      if (!user || user.status !== "active") return null;
      const credential = await credentialRepository.findByUserId(user.id);
      if (
        !credential ||
        credential.version !== session.credentialVersion
      ) {
        return null;
      }
      return toAuthenticatedUser(user);
    },

    async syncCredential(user, password) {
      const existing = await credentialRepository.findByUserId(user.id);
      if (password) {
        await savePassword(user, password);
        return;
      }
      if (!existing) {
        throw new AuthError(
          "CREDENTIAL_REQUIRED",
          "新增用户必须设置登录密码。"
        );
      }
      if (existing.username !== user.username) {
        await credentialRepository.save({
          ...existing,
          username: user.username,
        });
      }
    },

    async removeCredential(userId) {
      await credentialRepository.remove(userId);
    },

    async hasCredential(userId) {
      return Boolean(await credentialRepository.findByUserId(userId));
    },

    assertPasswordAcceptable,
  };
}

function assertPasswordAcceptable(password: string): void {
  if (!isAcceptablePassword(password)) {
    throw new AuthError(
      "INVALID_PASSWORD",
      "登录密码长度需为 6 至 128 个字符。"
    );
  }
}

function invalidCredentials(): AuthError {
  return new AuthError(
    "INVALID_CREDENTIALS",
    "用户名或密码不正确。"
  );
}

function toAuthenticatedUser(user: PermissionUser): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
