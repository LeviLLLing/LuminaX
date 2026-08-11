import type { NextRequest } from "next/server";
import { z } from "zod";
import { authorizeAdminRequest } from "@/modules/admin/admin-request-auth";
import {
  PermissionAdminError,
} from "@/modules/admin/permissions/permission-admin-application";
import { permissionAdminApplication } from "@/modules/admin/permissions/permission-composition";
import { AuthError } from "@/modules/auth/auth-application";
import { authApplication } from "@/modules/auth/auth-composition";
import {
  PERMISSION_USER_ROLES,
  PERMISSION_USER_STATUSES,
} from "@/modules/admin/permissions/permission-types";

export const dynamic = "force-dynamic";

const policySchema = z.object({
  tableName: z.string().min(1),
  allowedColumns: z.array(z.string()),
  allowedStoreIds: z.array(z.string()),
});

const userSchema = z.object({
  id: z.string().min(1).optional(),
  username: z.string(),
  displayName: z.string(),
  role: z.enum(PERMISSION_USER_ROLES),
  status: z.enum(PERMISSION_USER_STATUSES),
  policies: z.array(policySchema),
  password: z.string().max(128).optional(),
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("saveUser"), user: userSchema }),
  z.object({
    action: z.literal("setStatus"),
    id: z.string().min(1),
    status: z.enum(PERMISSION_USER_STATUSES),
  }),
  z.object({ action: z.literal("remove"), id: z.string().min(1) }),
  z.object({
    action: z.literal("evaluate"),
    userId: z.string().min(1),
    tableName: z.string().min(1),
    columnName: z.string().min(1),
    storeId: z.string().min(1),
  }),
]);

export async function GET(request: NextRequest): Promise<Response> {
  const denied = await authorizeAdminRequest(request);
  if (denied) return denied;
  try {
    const snapshot = await permissionAdminApplication.list();
    const users = await Promise.all(
      snapshot.users.map(async (user) => ({
        ...user,
        credentialConfigured: await authApplication.hasCredential(user.id),
      }))
    );
    return Response.json({ ...snapshot, users });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const denied = await authorizeAdminRequest(request);
  if (denied) return denied;
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return Response.json({ error: "请求参数不完整或格式错误。" }, { status: 400 });
  }

  try {
    switch (parsed.data.action) {
      case "saveUser":
        return saveUser(parsed.data.user);
      case "setStatus":
        return Response.json({
          user: await permissionAdminApplication.setStatus(
            parsed.data.id,
            parsed.data.status
          ),
        });
      case "remove": {
        const removed = await permissionAdminApplication.remove(parsed.data.id);
        await authApplication.removeCredential(parsed.data.id);
        return Response.json({ removed });
      }
      case "evaluate":
        return Response.json({
          decision: await permissionAdminApplication.evaluate(
            parsed.data.userId,
            parsed.data.tableName,
            parsed.data.columnName,
            parsed.data.storeId
          ),
        });
    }
  } catch (error) {
    return handleError(error);
  }
}

async function saveUser(
  input: z.infer<typeof userSchema>
): Promise<Response> {
  const { password, ...permissionInput } = input;
  if (!permissionInput.id && !password) {
    throw new AuthError("CREDENTIAL_REQUIRED", "新增用户必须设置登录密码。");
  }
  if (password) authApplication.assertPasswordAcceptable(password);

  const user = await permissionAdminApplication.saveUser(permissionInput);
  try {
    await authApplication.syncCredential(user, password || undefined);
  } catch (error) {
    if (!permissionInput.id) {
      await permissionAdminApplication.remove(user.id).catch(() => undefined);
    }
    throw error;
  }
  return Response.json({ user });
}

function handleError(error: unknown): Response {
  if (error instanceof AuthError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: 400 }
    );
  }
  if (error instanceof PermissionAdminError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.code === "NOT_FOUND" ? 404 : 400 }
    );
  }
  console.error("Permission admin request failed:", error);
  return Response.json({ error: "权限管理操作失败。" }, { status: 500 });
}
