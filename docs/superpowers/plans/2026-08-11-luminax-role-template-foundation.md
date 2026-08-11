# LuminaX Role Template Foundation Implementation Plan

> **For Codex:** Execute this plan with `superpowers:using-git-worktrees`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion`.

**Goal:** Add a permission-driven workbench context foundation with regional-manager and default role templates, while keeping the existing workbench fully compatible.

**Architecture:** Introduce a self-contained `workbench` module. A pure template resolver maps current roles to a template. A context application projects existing table/column/store policies and metric dependencies into a small client-safe contract. A single authenticated API route exposes that contract; current pages and components remain unchanged until the next UI phase.

**Tech Stack:** Next.js App Router, TypeScript, Node test runner, existing file repositories, existing MySQL metric executor.

**Test budget:** Add three focused contract tests. Run only `pnpm test -- --test-name-pattern=workbench` during development where practical, then run `pnpm run verify` once before completion.

---

## Task 1: Define Role Templates

**Files:**
- Create: `src/modules/workbench/workbench-types.ts`
- Create: `src/modules/workbench/workbench-templates.ts`
- Create: `tests/workbench/workbench.test.ts`
- Modify: `tests/module-interfaces.test.ts`

**Step 1: Write the failing template contract test**

Assert that:
- `manager` resolves to `regional_manager`.
- `super_admin` and `analyst` resolve to `default`.
- an unknown role safely resolves to `default`.
- both templates expose deterministic intent ordering and no `irrelevant` intent.

**Step 2: Run the focused test and confirm failure**

Run: `pnpm test -- --test-name-pattern="workbench template"`

**Step 3: Implement the minimal template domain**

Add these public contracts:

```ts
export type WorkbenchTemplateId = "regional_manager" | "default";

export interface WorkbenchTemplate {
  id: WorkbenchTemplateId;
  intentOrder: readonly WorkbenchIntent[];
}

export type WorkbenchIntent = Exclude<AnalysisIntent, "irrelevant">;

export function resolveWorkbenchTemplate(role: string): WorkbenchTemplate;
```

Keep template definitions immutable. The regional-manager order starts with anomaly discovery, achievement, comparison, attribution, and report. The default order starts with common metric analysis. Append `custom_metric` to both templates.

**Step 4: Run the focused test and confirm pass**

Run: `pnpm test -- --test-name-pattern="workbench template"`

**Step 5: Commit**

```bash
git add src/modules/workbench tests/workbench tests/module-interfaces.test.ts
git commit -m "feat: add workbench role templates"
```

## Task 2: Project Permissions Into Workbench Context

**Files:**
- Create: `src/modules/workbench/workbench-context-application.ts`
- Create: `src/modules/workbench/workbench-composition.ts`
- Modify: `tests/workbench/workbench.test.ts`

**Step 1: Write the failing projection contract test**

Use in-memory permission and metric repositories. Cover two users in one test:
- A restricted manager only receives database store IDs present in their policies, fixed metrics whose complete table/column dependencies are authorized, and published custom metrics whose parsed SQL dependencies are authorized.
- A super admin receives every database store ID, every fixed metric, every published custom metric, and `canAccessAdmin: true`.

Also assert the returned object contains only:

```ts
interface WorkbenchContext {
  templateId: WorkbenchTemplateId;
  availableStoreIds: string[];
  availableMetricCodes: string[];
  availableIntents: WorkbenchIntent[];
  canAccessAdmin: boolean;
}
```

No table policy, column policy, SQL, or credential data may appear.

**Step 2: Run the focused test and confirm failure**

Run: `pnpm test -- --test-name-pattern="workbench context"`

**Step 3: Implement the context application**

Add dependency-injected construction:

```ts
export interface WorkbenchContextDependencies {
  permissionRepository: PermissionRepository;
  metricRepository: MetricDefinitionRepository;
  listStoreIds(): Promise<string[]>;
}

export interface WorkbenchContextApplication {
  getContext(user: AuthenticatedUser): Promise<WorkbenchContext>;
}

export function createWorkbenchContextApplication(
  dependencies: WorkbenchContextDependencies
): WorkbenchContextApplication;
```

Projection rules:
- Resolve the full active permission user by authenticated ID, then username as fallback; reject missing or disabled users with `DataAccessDeniedError`.
- For super admins, expose all database store IDs, all fixed system metric codes, and all published custom metric codes.
- For other users, expose the union of policy store IDs intersected with database store IDs.
- A fixed metric is available only when every requirement in `FIXED_METRIC_ACCESS_REQUIREMENTS` has an authorized table, every required column, and at least one common authorized store.
- A published custom metric is available only when `getCustomMetricAccessRequirements()` passes the same rule.
- Preserve template intent order. Include `custom_metric` only when at least one custom metric is available.
- Deduplicate every returned list.

Composition uses the existing file repositories and `MySqlSqlMetricQueryExecutor`; no database connection occurs until the API is called.

**Step 4: Run the focused test and confirm pass**

Run: `pnpm test -- --test-name-pattern="workbench context"`

**Step 5: Commit**

```bash
git add src/modules/workbench tests/workbench/workbench.test.ts
git commit -m "feat: project permissions into workbench context"
```

## Task 3: Expose Authenticated Context API

**Files:**
- Create: `src/app/api/workbench/context/route.ts`
- Modify: `tests/workbench/workbench.test.ts`
- Modify: `README.md`

**Step 1: Write the failing API contract test**

Export a dependency-injected handler factory and assert in one test that:
- an unauthenticated request returns `401`.
- an authenticated request returns `200`, `Cache-Control: no-store`, and the exact safe `WorkbenchContext` JSON.
- a permission denial returns `403`.

**Step 2: Run the focused test and confirm failure**

Run: `pnpm test -- --test-name-pattern="workbench context API"`

**Step 3: Implement the route**

Add:

```ts
export interface WorkbenchContextRouteDependencies {
  authenticate(request: NextRequest): Promise<AuthenticatedUser | null>;
  getContext(user: AuthenticatedUser): Promise<WorkbenchContext>;
}

export function createGetWorkbenchContextHandler(
  dependencies: WorkbenchContextRouteDependencies
): (request: NextRequest) => Promise<Response>;
```

Wire the exported `GET` to `authenticateRequest` and the default workbench context application. Map authentication failure to `401`, `DataAccessDeniedError` to `403`, and unexpected failure to a generic `500` response. All responses use `Cache-Control: no-store`.

Document `/api/workbench/context` in the README without changing current UI routes.

**Step 4: Run the focused test and confirm pass**

Run: `pnpm test -- --test-name-pattern="workbench context API"`

**Step 5: Perform one final verification**

Run: `pnpm run verify`

Expected: validation, TypeScript, ESLint, all tests, and production build pass.

**Step 6: Commit**

```bash
git add src/app/api/workbench/context/route.ts tests/workbench/workbench.test.ts README.md
git commit -m "feat: expose workbench context API"
```

## Completion Criteria

- Existing login, workbench, chat, reporting, admin, and data APIs remain compatible.
- `manager`, `analyst`, `super_admin`, and unknown-role fallback behavior are deterministic.
- Workbench context is derived from current permissions and metric dependencies, not duplicated authorization rules.
- The API returns no raw policy or SQL details.
- Exactly three new focused tests cover templates, projection, and API behavior.
- `pnpm run verify` passes once at the end.
