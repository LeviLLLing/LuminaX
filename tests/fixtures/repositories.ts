import type {
  CustomMetricDefinition,
} from "../../src/modules/admin/metrics/metric-definition";
import type { MetricDefinitionRepository } from "../../src/modules/admin/metrics/metric-definition-repository";
import type { PermissionRepository } from "../../src/modules/admin/permissions/permission-repository";
import type { PermissionUser } from "../../src/modules/admin/permissions/permission-types";
import type { CredentialRepository } from "../../src/modules/auth/credential-repository";
import type { PasswordCredential } from "../../src/modules/auth/auth-types";

export class InMemoryMetricRepository implements MetricDefinitionRepository {
  private readonly metrics = new Map<string, CustomMetricDefinition>();

  async list(): Promise<CustomMetricDefinition[]> {
    return [...this.metrics.values()].map((metric) => structuredClone(metric));
  }

  async findById(id: string): Promise<CustomMetricDefinition | null> {
    const metric = this.metrics.get(id);
    return metric ? structuredClone(metric) : null;
  }

  async save(metric: CustomMetricDefinition): Promise<CustomMetricDefinition> {
    this.metrics.set(metric.id, structuredClone(metric));
    return structuredClone(metric);
  }

  async remove(id: string): Promise<boolean> {
    return this.metrics.delete(id);
  }
}

export class InMemoryPermissionRepository implements PermissionRepository {
  private readonly users = new Map<string, PermissionUser>();

  constructor(users: PermissionUser[]) {
    users.forEach((user) => this.users.set(user.id, structuredClone(user)));
  }

  async list(): Promise<PermissionUser[]> {
    return [...this.users.values()].map((user) => structuredClone(user));
  }

  async findByIdOrUsername(identity: string): Promise<PermissionUser | null> {
    const normalized = identity.toLowerCase();
    const user = [...this.users.values()].find(
      (item) =>
        item.id.toLowerCase() === normalized ||
        item.username.toLowerCase() === normalized
    );
    return user ? structuredClone(user) : null;
  }

  async save(user: PermissionUser): Promise<PermissionUser> {
    this.users.set(user.id, structuredClone(user));
    return structuredClone(user);
  }

  async remove(id: string): Promise<boolean> {
    return this.users.delete(id);
  }
}

export class InMemoryCredentialRepository implements CredentialRepository {
  private readonly credentials = new Map<string, PasswordCredential>();

  async findByUserId(userId: string): Promise<PasswordCredential | null> {
    const credential = this.credentials.get(userId);
    return credential ? structuredClone(credential) : null;
  }

  async save(
    credential: PasswordCredential
  ): Promise<PasswordCredential> {
    this.credentials.set(credential.userId, structuredClone(credential));
    return structuredClone(credential);
  }

  async remove(userId: string): Promise<boolean> {
    return this.credentials.delete(userId);
  }
}
