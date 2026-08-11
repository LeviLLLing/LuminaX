import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PermissionUser } from "./permission-types";

export const SYSTEM_ADMIN_USER_ID = "system-admin";

interface PermissionRegistryFile {
  version: 1;
  users: PermissionUser[];
}

export interface PermissionRepository {
  list(): Promise<PermissionUser[]>;
  findByIdOrUsername(identity: string): Promise<PermissionUser | null>;
  save(user: PermissionUser): Promise<PermissionUser>;
  remove(id: string): Promise<boolean>;
}

export class FilePermissionRepository implements PermissionRepository {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath =
      process.env.LUMINAX_PERMISSION_REGISTRY_PATH ||
      join(process.cwd(), ".luminax", "access-control.json")
  ) {}

  async list(): Promise<PermissionUser[]> {
    const registry = await this.readRegistry();
    return registry.users.map(cloneUser);
  }

  async findByIdOrUsername(identity: string): Promise<PermissionUser | null> {
    const normalized = identity.trim().toLowerCase();
    const user = (await this.list()).find(
      (item) =>
        item.id.toLowerCase() === normalized ||
        item.username.toLowerCase() === normalized
    );
    return user || null;
  }

  async save(user: PermissionUser): Promise<PermissionUser> {
    return this.withWriteLock(async () => {
      const registry = await this.readRegistry();
      const username = user.username.toLowerCase();
      const conflict = registry.users.find(
        (item) =>
          item.id !== user.id && item.username.toLowerCase() === username
      );
      if (conflict) throw new Error(`用户名 ${user.username} 已存在。`);

      const index = registry.users.findIndex((item) => item.id === user.id);
      if (index >= 0) registry.users[index] = cloneUser(user);
      else registry.users.push(cloneUser(user));
      await this.writeRegistry(registry);
      return cloneUser(user);
    });
  }

  async remove(id: string): Promise<boolean> {
    if (id === SYSTEM_ADMIN_USER_ID) return false;
    return this.withWriteLock(async () => {
      const registry = await this.readRegistry();
      const users = registry.users.filter((user) => user.id !== id);
      if (users.length === registry.users.length) return false;
      await this.writeRegistry({ version: 1, users });
      return true;
    });
  }

  private async readRegistry(): Promise<PermissionRegistryFile> {
    let users: PermissionUser[] = [];
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as Partial<PermissionRegistryFile>;
      users = Array.isArray(parsed.users) ? parsed.users : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    return {
      version: 1,
      users: [
        createSystemAdmin(),
        ...users.filter((user) => user.id !== SYSTEM_ADMIN_USER_ID),
      ],
    };
  }

  private async writeRegistry(registry: PermissionRegistryFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      `${JSON.stringify(registry, null, 2)}\n`,
      "utf8"
    );
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writeQueue.then(operation, operation);
    this.writeQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

function createSystemAdmin(): PermissionUser {
  const createdAt = "2026-01-01T00:00:00.000Z";
  return {
    id: SYSTEM_ADMIN_USER_ID,
    username: "admin",
    displayName: "系统管理员",
    role: "super_admin",
    status: "active",
    system: true,
    policies: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function cloneUser(user: PermissionUser): PermissionUser {
  return structuredClone(user);
}

