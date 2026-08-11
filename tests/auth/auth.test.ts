import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AuthError,
  createAuthApplication,
} from "../../src/modules/auth/auth-application";
import { SessionManager } from "../../src/modules/auth/session-manager";
import {
  createRestrictedPermissionUser,
  createSystemPermissionUser,
} from "../fixtures/metrics";
import {
  InMemoryCredentialRepository,
  InMemoryPermissionRepository,
} from "../fixtures/repositories";

test("authentication hashes passwords and invalidates sessions after reset", async () => {
  const permissions = new InMemoryPermissionRepository([
    createSystemPermissionUser(),
    createRestrictedPermissionUser(),
  ]);
  const credentials = new InMemoryCredentialRepository();
  const secretPath = join(
    tmpdir(),
    `luminax-session-${Date.now()}-${Math.random().toString(36).slice(2)}.key`
  );
  const auth = createAuthApplication(
    permissions,
    credentials,
    new SessionManager(secretPath)
  );

  try {
    const adminLogin = await auth.login("admin", "LuminaX");
    const storedAdminCredential = await credentials.findByUserId(
      "system-admin"
    );
    assert.ok(storedAdminCredential);
    assert.notEqual(storedAdminCredential.passwordHash, "LuminaX");
    assert.equal(
      (await auth.authenticateSession(adminLogin.token))?.role,
      "super_admin"
    );
    assert.equal(
      await auth.authenticateSession(`${adminLogin.token}tampered`),
      null
    );

    const analyst = (await permissions.findByIdOrUsername("analyst-one"))!;
    await auth.syncCredential(analyst, "first-pass");
    const firstLogin = await auth.login("analyst.one", "first-pass");
    await auth.syncCredential(analyst, "second-pass");
    assert.equal(await auth.authenticateSession(firstLogin.token), null);
    await assert.rejects(
      () => auth.login("analyst.one", "first-pass"),
      (error) =>
        error instanceof AuthError && error.code === "INVALID_CREDENTIALS"
    );
    assert.equal(
      (await auth.login("analyst.one", "second-pass")).user.id,
      "analyst-one"
    );
  } finally {
    await rm(secretPath, { force: true });
  }
});
