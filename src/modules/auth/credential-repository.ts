import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PasswordCredential } from "./auth-types";

interface CredentialRegistryFile {
  version: 1;
  credentials: PasswordCredential[];
}

export interface CredentialRepository {
  findByUserId(userId: string): Promise<PasswordCredential | null>;
  save(credential: PasswordCredential): Promise<PasswordCredential>;
  remove(userId: string): Promise<boolean>;
}

export class FileCredentialRepository implements CredentialRepository {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly filePath =
      process.env.LUMINAX_CREDENTIAL_REGISTRY_PATH ||
      join(process.cwd(), ".luminax", "credentials.json")
  ) {}

  async findByUserId(userId: string): Promise<PasswordCredential | null> {
    const registry = await this.readRegistry();
    const credential = registry.credentials.find(
      (item) => item.userId === userId
    );
    return credential ? structuredClone(credential) : null;
  }

  async save(credential: PasswordCredential): Promise<PasswordCredential> {
    return this.withWriteLock(async () => {
      const registry = await this.readRegistry();
      const index = registry.credentials.findIndex(
        (item) => item.userId === credential.userId
      );
      if (index >= 0) registry.credentials[index] = structuredClone(credential);
      else registry.credentials.push(structuredClone(credential));
      await this.writeRegistry(registry);
      return structuredClone(credential);
    });
  }

  async remove(userId: string): Promise<boolean> {
    return this.withWriteLock(async () => {
      const registry = await this.readRegistry();
      const credentials = registry.credentials.filter(
        (credential) => credential.userId !== userId
      );
      if (credentials.length === registry.credentials.length) return false;
      await this.writeRegistry({ version: 1, credentials });
      return true;
    });
  }

  private async readRegistry(): Promise<CredentialRegistryFile> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as Partial<CredentialRegistryFile>;
      return {
        version: 1,
        credentials: Array.isArray(parsed.credentials)
          ? parsed.credentials
          : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, credentials: [] };
      }
      throw error;
    }
  }

  private async writeRegistry(
    registry: CredentialRegistryFile
  ): Promise<void> {
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

