# LuminaX Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a truthful project documentation and quality baseline before product UI and architecture refactoring begins.

**Architecture:** Preserve every runtime behavior while making the repository reviewable. Rewrite the project facts, split tests by ownership without changing assertions, add explicit compatibility contracts, and install a local/GitHub verification gate. This is plan 1 of 6; role templates, workbench UI, admin UI, core modularization, and release verification each receive a separate plan after this baseline lands.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Node test runner through `tsx`, ESLint 9, pnpm 9, GitHub Actions.

## Global Constraints

- Preserve existing URLs, API payloads, SSE wire format, authentication Cookie, MySQL schema, metric definitions, and permission semantics.
- Do not commit `.env.local`, `.luminax/`, `.superpowers/`, log files, generated builds, API keys, database credentials, or runtime user data.
- Use pnpm only for package management and project scripts.
- Use `apply_patch` for manual file edits; use `git mv` only for mechanical file moves.
- Every behavior change starts with a failing test; pure documentation and test-organization changes use characterization verification before and after.
- Keep `main` runnable after every task and push each accepted commit to `origin/main`.
- Do not introduce product features, role templates, workbench UI changes, or backend module refactors in this phase.

---

## Plan Set

This approved product refactor is intentionally split into independently testable plans:

1. `2026-08-11-luminax-foundation.md` — documentation, test ownership, compatibility contracts, CI.
2. `2026-08-11-luminax-role-template-foundation.md` — workbench context and template resolver.
3. `2026-08-11-luminax-workbench-ui.md` — bright dual-core workbench and responsive behavior.
4. `2026-08-11-luminax-admin-modularization.md` — capability-based admin routes and panel splits.
5. `2026-08-11-luminax-core-modularization.md` — SQL, executor, and Agent internal boundaries.
6. `2026-08-11-luminax-release-verification.md` — full compatibility, browser, performance, and delivery verification.

Only plan 1 is executed from this file. Later plans are written immediately before their phase so their file references match the repository state produced by earlier phases.

---

### Task 1: Replace Stale Project Facts

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/architecture.md`
- Reference: `docs/superpowers/specs/2026-08-11-luminax-product-refactor-design.md`

**Interfaces:**
- Consumes: current module exports and routes under `src/app` and `src/modules`
- Produces: a project-level instruction contract in `AGENTS.md` and a human-readable module map in `docs/architecture.md`

- [ ] **Step 1: Capture the stale assertions before editing**

Run:

```powershell
rg -n "所有数值计算由 JavaScript|聊天接口不依赖外部 LLM|固定的 sales_data.json|本地规则识别 \+ JavaScript 计算" AGENTS.md
```

Expected: at least four matches showing that the current document contradicts the implementation.

- [ ] **Step 2: Rewrite `AGENTS.md` as the project fact source**

Replace the file with the following exact section structure and rules:

```markdown
# LuminaX Project Instructions

## Product Contract
- LuminaX is an extensible local POC for governed business analytics.
- The product provides metric calculation, custom metric registration, reports, attribution, authentication, and data permissions.
- Preserve the public API, SSE protocol, MySQL schema, SQL Server adapter interface, and runtime registry compatibility.

## Current Stack
- Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui and Radix UI.
- ECharts for charts, MySQL as the active SQL metric source, and a retained SQL Server data-source adapter.
- DeepSeek models for governance, business explanation, attribution, and metric SQL authoring.

## Architecture Boundaries
### Routes and adapters
### Application use cases
### Agents
### Metrics and SQL
### Permissions and authentication
### Reports and visualization
### Runtime repositories

## Non-Negotiable Data Rules
- Fixed and published custom metric values are calculated by SQL, not by an Agent.
- Agents select intent, store scope, date range, and presentation; they do not invent final numeric values.
- Every data request is authorized on the server by table, column, and store value.
- Attribution receives only data that was already scoped and authorized.

## Agent Contract
### Governance Agent
### Business Agent
### Attribution Agent
### Metric SQL Authoring Agent

## Frontend and UI Contract
- Use a unified workbench, role templates, and server-enforced permission projection.
- Use the approved bright operations-center visual direction.
- Keep operational screens dense, calm, scan-friendly, and responsive from 360px upward.
- Use Lucide icons for familiar actions and tooltips for unfamiliar icon-only controls.
- Do not nest cards, add decorative orbs, or use marketing-page composition in the workbench.

## Security
- Never commit `.env.local`, `.luminax/`, `.superpowers/`, logs, API keys, database passwords, session keys, or credential files.
- Do not log secrets, cookies, personal values, or full SQL parameter values.
- Custom metric SQL must remain read-only, allowlisted, scoped, validated, and test-executed before publishing.

## Superpowers Workflow
- Use brainstorming before creative product or architecture changes.
- Write an approved design spec before implementation.
- Use writing-plans for multi-step work.
- Use test-driven-development for behavior changes and systematic-debugging for failures.
- Use verification-before-completion before any completion claim.
- Use requesting-code-review before integrating a major phase.

## Testing and Definition of Done
- Run `pnpm run ts-check`, `pnpm run lint:build`, `pnpm run test`, and `pnpm run build` for a release-level change.
- Run MySQL checks separately when the local database is available.
- Verify affected user journeys in a browser at desktop and mobile widths.
- Keep documentation synchronized with architecture changes.

## Git Workflow
- `main` tracks `origin/main`.
- Keep commits scoped to one independently reviewable task.
- Inspect staged files for secrets and unrelated changes before every push.

## Local Commands
```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm run test:mysql
pnpm run test:sql-metrics
pnpm run test:admin-metrics
pnpm run validate
pnpm run verify
```
```

Fill each architecture and Agent subsection with the concrete module paths and public interfaces that exist in the repository. State explicitly that each of the three runtime Agents has its own model, memory, and System Prompt, and that the attribution RAG port currently defaults to Noop.

- [ ] **Step 3: Create `docs/architecture.md`**

Write the current, not future, architecture with these exact sections:

```markdown
# LuminaX Current Architecture

## Runtime Request Flow
1. Next.js route authenticates and validates.
2. Governance Agent reviews the raw question.
3. Business Agent classifies the request and obtains an authorized data scope.
4. MySQL fixed SQL or a published custom metric executes.
5. Business or Attribution Agent explains the structured result.
6. The HTTP adapter emits the existing SSE protocol.

## Module Map
| Module | Responsibility | Public entry points |
|---|---|---|
| auth | Passwords, sessions, login limits | authApplication, authenticateRequest |
| admin/permissions | User and table/column/store authorization | accessControl, permissionAdminApplication |
| admin/metrics | Metric definitions, SQL validation, publishing | metricAdminApplication, customMetricRuntime |
| agents | Governance, business, attribution, SQL authoring | create*Agent factories |
| chat | Chat use case, HTTP adapter, SSE and formatters | chatApplication, handleChatHttpRequest |
| metrics | Fixed SQL contracts and result models | SqlMetricQueryExecutor |
| data-source | JSON, MySQL, SQL Server adapters | SalesDataSource, readDatabaseConfig |
| reports | Stable report model and renderers | generateWeeklyReportHTML |

## Agent Topology
## SQL Metric Flow
## Permission Enforcement
## Runtime State
## Known POC Boundaries
```

Document `.luminax` as ignored local runtime state. Document MySQL as the active fixed metric executor and SQL Server as a retained interface without claiming full metric parity.

- [ ] **Step 4: Verify stale claims are gone and required facts exist**

Run:

```powershell
rg -n "所有数值计算由 JavaScript|聊天接口不依赖外部 LLM|固定的 sales_data.json" AGENTS.md
rg -n "DeepSeek|MySQL|SQL Server|治理 Agent|业务 Agent|归因 Agent|Superpowers|\.luminax" AGENTS.md docs/architecture.md
```

Expected: the first command returns no matches; the second returns matches for every required fact.

- [ ] **Step 5: Check and commit the documentation contract**

Run:

```bash
git diff --check
git add AGENTS.md docs/architecture.md
git diff --cached --name-only
git commit -m "docs: align project instructions with current architecture"
git push
```

Expected: exactly `AGENTS.md` and `docs/architecture.md` are staged; push updates `origin/main`.

---

### Task 2: Replace the Generic Runbook and Dark-Only Design Guide

**Files:**
- Modify: `README.md`
- Modify: `DESIGN.md`
- Reference: `.env.example`
- Reference: `package.json`

**Interfaces:**
- Consumes: current environment variable names and package scripts
- Produces: an operator-facing local runbook and the approved bright UI design contract

- [ ] **Step 1: Record the current documentation drift**

Run:

```powershell
rg -n "本地演示数据源|本地规则识别|深黑底色|右侧 32%" README.md DESIGN.md
```

Expected: matches in both files.

- [ ] **Step 2: Rewrite `README.md` as a LuminaX runbook**

Use these exact top-level sections:

```markdown
# LuminaX Local POC
## Capabilities
## Architecture at a Glance
## Prerequisites
## Install
## Environment Configuration
### DeepSeek
### MySQL
### SQL Server Interface
### Runtime State
## First Login
## Run Locally
## Validate and Build
## Database Checks
## Repository Structure
## Security Notes
## Troubleshooting
```

Copy environment variable names from `.env.example`; never copy values from `.env.local`. Explain that `LUMINAX_DATA_SOURCE=mysql` is the active local setup, `json` is a demo fallback, and `sqlserver` retains the adapter interface. Explain that credentials and permission registries live under ignored `.luminax/`. Do not write any real default password into the document.

- [ ] **Step 3: Rewrite `DESIGN.md` for the approved bright operations center**

Use these exact sections and constraints:

```markdown
# LuminaX Design System
## Product Character
## Color Roles
## Typography
## Density and Spacing
## Unified Workbench
## Role Templates and Permission States
## Admin Shell
## Responsive Behavior
## Loading, Empty, Error, and Denied States
## Interaction and Motion
## Accessibility
## Prohibited Patterns
```

Define white/light-gray work surfaces, dark text, LuminaX yellow for brand and primary actions, and red/green/blue only for business state. Specify desktop dual-core layout and mobile segmented workbench. Preserve the existing `#FFE600` brand color while removing the requirement for a dark-only page.

- [ ] **Step 4: Verify commands and environment names against source files**

Run:

```powershell
$readme = Get-Content -Raw -Encoding utf8 README.md
$example = Get-Content -Raw -Encoding utf8 .env.example
@('DEEPSEEK_API_KEY','LUMINAX_DATA_SOURCE','MYSQL_HOST','MYSQL_DATABASE','MYSQL_USERNAME','MYSQL_PASSWORD') | ForEach-Object { if (-not $readme.Contains($_) -or -not $example.Contains($_)) { throw "Missing environment variable: $_" } }
rg -n "pnpm (dev|test|build)|pnpm run (validate|test:mysql|test:sql-metrics|test:admin-metrics)" README.md
```

Expected: no PowerShell exception and every supported command is documented.

- [ ] **Step 5: Commit the runbook and design contract**

Run:

```bash
git diff --check
git add README.md DESIGN.md
git commit -m "docs: refresh local runbook and design system"
git push
```

Expected: one documentation-only commit on `origin/main`.

---

### Task 3: Split the Monolithic Test Suite by Ownership

**Files:**
- Modify: `tests/module-interfaces.test.ts`
- Create: `tests/fixtures/fake-agent-model.ts`
- Create: `tests/fixtures/repositories.ts`
- Create: `tests/fixtures/metrics.ts`
- Create: `tests/admin/metrics.test.ts`
- Create: `tests/admin/permissions.test.ts`
- Create: `tests/auth/auth.test.ts`
- Create: `tests/analysis/analysis.test.ts`
- Create: `tests/agents/agents.test.ts`
- Create: `tests/chat/chat.test.ts`
- Create: `tests/reports/reports.test.ts`

**Interfaces:**
- Consumes: the existing 22 characterization tests
- Produces: the same 22 tests through ownership-specific files; `tests/module-interfaces.test.ts` remains the stable package-script entry point

- [ ] **Step 1: Run and record the pre-split baseline**

Run:

```bash
pnpm test
```

Expected: `22` tests, `22` pass, `0` fail.

- [ ] **Step 2: Extract `FakeAgentModel`**

Create `tests/fixtures/fake-agent-model.ts` with this public contract:

```ts
import type {
  AgentModel,
  AgentModelRequest,
} from "../../src/modules/agents/shared/agent-model";

export class FakeAgentModel implements AgentModel {
  readonly requests: AgentModelRequest[] = [];

  constructor(
    readonly modelName: string,
    private readonly responder: (
      request: AgentModelRequest
    ) => string | null | Promise<string | null>
  ) {}

  async complete(request: AgentModelRequest): Promise<string | null> {
    this.requests.push(request);
    return this.responder(request);
  }
}
```

Move the current implementation without changing its behavior.

- [ ] **Step 3: Extract repositories and metric fixtures**

`tests/fixtures/repositories.ts` exports:

```ts
export class InMemoryMetricRepository implements MetricDefinitionRepository
export class InMemoryPermissionRepository implements PermissionRepository
export class InMemoryCredentialRepository implements CredentialRepository
```

`tests/fixtures/metrics.ts` exports:

```ts
export const SAFE_CUSTOM_METRIC_SQL: string;
export function createSystemPermissionUser(): PermissionUser;
export function createRestrictedPermissionUser(): PermissionUser;
export function createPublishedMetric(): CustomMetricDefinition;
```

Move the exact existing implementations from the bottom of `tests/module-interfaces.test.ts`; do not change fixture values or dates.

- [ ] **Step 4: Move tests into ownership files**

Move tests by their current names:

```text
tests/admin/metrics.test.ts
  metric SQL authoring retries once...
  custom metric SQL validator...
  metric admin application publishes...
  custom metric permissions are derived...

tests/admin/permissions.test.ts
  permission control enforces...
  permission admin saves...

tests/auth/auth.test.ts
  authentication hashes passwords...

tests/analysis/analysis.test.ts
  analysis snapshot applies scope...
  analysis registry formats...

tests/agents/agents.test.ts
  all governance tests
  attribution agent uses independent...
  business agent calls fixed SQL...
  business agent resolves published custom metrics...

tests/chat/chat.test.ts
  chat application routes...
  SSE parser keeps protocol handling...
  chat stream preserves a server permission error...

tests/reports/reports.test.ts
  report renderers consume...
```

Each file imports only the production types and shared fixtures it uses.

- [ ] **Step 5: Turn the stable entry point into an import-only aggregator**

Replace `tests/module-interfaces.test.ts` with:

```ts
import "./admin/metrics.test";
import "./admin/permissions.test";
import "./auth/auth.test";
import "./analysis/analysis.test";
import "./agents/agents.test";
import "./chat/chat.test";
import "./reports/reports.test";
```

- [ ] **Step 6: Verify exact behavior preservation**

Run:

```bash
pnpm test
pnpm run ts-check
```

Expected: exactly `22` tests pass and TypeScript exits `0`. A changed test count or assertion is a failure of this task.

- [ ] **Step 7: Commit the ownership split**

Run:

```bash
git add tests
git diff --cached --stat
git commit -m "test: split suites by module ownership"
git push
```

Expected: only test files change; no production behavior changes.

---

### Task 4: Add Public Compatibility Characterization Tests

**Files:**
- Create: `tests/contracts/public-contracts.test.ts`
- Modify: `tests/module-interfaces.test.ts`
- Test: `tests/contracts/public-contracts.test.ts`

**Interfaces:**
- Consumes: `streamChatResponse`, `jsonError`, `AUTH_COOKIE_NAME`, `AUTH_SESSION_MAX_AGE_SECONDS`
- Produces: an executable compatibility boundary for later refactors

- [ ] **Step 1: Write the SSE and error characterization tests**

Create `tests/contracts/public-contracts.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_COOKIE_NAME,
  AUTH_SESSION_MAX_AGE_SECONDS,
} from "../../src/modules/auth/session-manager";
import {
  jsonError,
  streamChatResponse,
} from "../../src/modules/chat/sse-response";

test("public chat SSE wire format remains stable", async () => {
  const response = streamChatResponse(
    {
      intent: "achievement_rate",
      storeIds: ["S001"],
      startDate: "2025-05-01",
      endDate: "2025-05-14",
      relevant: true,
      outOfScope: false,
    },
    "分析完成",
    ["S001"],
    "2025-05-01",
    "2025-05-14"
  );

  assert.equal(
    response.headers.get("Content-Type"),
    "text/event-stream; charset=utf-8"
  );
  assert.equal(response.headers.get("Cache-Control"), "no-cache");
  assert.equal(
    await response.text(),
    'data: {"type":"intent","intent":"achievement_rate","storeIds":["S001"],"startDate":"2025-05-01","endDate":"2025-05-14"}\n\n' +
      'data: {"type":"content","content":"分析完成"}\n\n' +
      "data: [DONE]\n\n"
  );
});

test("public JSON errors preserve status and body", async () => {
  const response = jsonError("没有权限。", 403);
  assert.equal(response.status, 403);
  assert.equal(
    response.headers.get("Content-Type"),
    "application/json; charset=utf-8"
  );
  assert.deepEqual(await response.json(), { error: "没有权限。" });
});

test("authentication cookie contract remains stable", () => {
  assert.equal(AUTH_COOKIE_NAME, "luminax_session");
  assert.equal(AUTH_SESSION_MAX_AGE_SECONDS, 8 * 60 * 60);
});
```

- [ ] **Step 2: Register the contract suite**

Add this import to `tests/module-interfaces.test.ts`:

```ts
import "./contracts/public-contracts.test";
```

- [ ] **Step 3: Run the characterization suite**

Run:

```bash
pnpm test
```

Expected: `25` tests pass. These tests are characterization tests for existing behavior, so they pass before later refactors; do not change production code in this task.

- [ ] **Step 4: Commit the public contract**

Run:

```bash
git add tests/contracts/public-contracts.test.ts tests/module-interfaces.test.ts
git commit -m "test: lock public API compatibility contracts"
git push
```

Expected: one test-only commit.

---

### Task 5: Add Documentation Contracts and Repository Quality Gates

**Files:**
- Create: `tests/docs/documentation.test.ts`
- Modify: `tests/module-interfaces.test.ts`
- Create: `.gitattributes`
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the rewritten project documents and current pnpm scripts
- Produces: executable documentation checks, deterministic line endings, `pnpm verify`, and a GitHub CI gate

- [ ] **Step 1: Write documentation contract tests**

Create `tests/docs/documentation.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("project instructions describe the current architecture", async () => {
  const agents = await readFile("AGENTS.md", "utf8");
  for (const required of [
    "DeepSeek",
    "MySQL",
    "SQL Server",
    "Governance Agent",
    "Business Agent",
    "Attribution Agent",
    "Superpowers",
  ]) {
    assert.match(agents, new RegExp(required));
  }
  assert.doesNotMatch(agents, /所有数值计算由 JavaScript/);
  assert.doesNotMatch(agents, /聊天接口不依赖外部 LLM/);
});

test("runbook and design guide contain approved contracts", async () => {
  const [readme, design] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("DESIGN.md", "utf8"),
  ]);
  assert.match(readme, /LUMINAX_DATA_SOURCE/);
  assert.match(readme, /MYSQL_USERNAME/);
  assert.match(readme, /pnpm run validate/);
  assert.match(design, /明亮经营中枢/);
  assert.match(design, /360px/);
});
```

Add this import to `tests/module-interfaces.test.ts`:

```ts
import "./docs/documentation.test";
```

- [ ] **Step 2: Run the new tests before tooling changes**

Run:

```bash
pnpm test
```

Expected: `27` tests pass. If a required phrase differs in the approved documents, update the test and document together so the assertion checks the same approved fact, not a spelling accident.

- [ ] **Step 3: Add deterministic line endings**

Create `.gitattributes`:

```gitattributes
* text=auto eol=lf
*.png binary
*.ico binary
```

- [ ] **Step 4: Exclude runtime and VCS directories from explicit ESLint scanning**

Add these entries to `globalIgnores` in `eslint.config.mjs`:

```js
'.git/**',
'.luminax/**',
'.superpowers/**',
'coverage/**',
```

Keep all existing ignores and rules.

- [ ] **Step 5: Add a release-level verification script**

Modify only the scripts section of `package.json`:

```json
{
  "test": "tsx --test tests/module-interfaces.test.ts",
  "test:contracts": "tsx --test tests/contracts/public-contracts.test.ts tests/docs/documentation.test.ts",
  "validate": "pnpm run ts-check && pnpm run lint:build && pnpm run test",
  "verify": "pnpm run validate && pnpm run build"
}
```

Retain all existing database check scripts.

- [ ] **Step 6: Add GitHub CI**

Create `.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.0.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run verify
```

Do not add DeepSeek or database secrets. Unit tests and the production build must remain offline-safe.

- [ ] **Step 7: Run the full local quality gate**

Run:

```bash
pnpm run test:contracts
pnpm run verify
```

Expected: `5` contract/documentation tests pass, then TypeScript, ESLint, all `27` tests, and the Next.js production build exit `0`.

- [ ] **Step 8: Scan the staged files for secrets**

Run:

```powershell
git add .gitattributes .github/workflows/ci.yml eslint.config.mjs package.json tests
$staged = git diff --cached --name-only
$forbidden = $staged | Where-Object { $_ -match '(^|/)(\.env\.local|\.luminax|\.superpowers)(/|$)|\.log$' }
if ($forbidden) { throw "Sensitive paths staged: $forbidden" }
git grep --cached -n -I -E 'sk-[A-Za-z0-9_-]{16,}'
if ($LASTEXITCODE -eq 0) { throw 'Potential API key staged' }
```

Expected: no forbidden path and no API key match.

- [ ] **Step 9: Commit and push the quality gate**

Run:

```bash
git diff --cached --check
git commit -m "chore: add repository quality gates"
git push
```

Expected: CI starts on GitHub for the pushed `main` commit.

---

### Task 6: Verify the Phase 0 Deliverable

**Files:**
- Verify: `AGENTS.md`
- Verify: `README.md`
- Verify: `DESIGN.md`
- Verify: `docs/architecture.md`
- Verify: `tests/**`
- Verify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: all outputs from Tasks 1-5
- Produces: a green, documented baseline ready for the role-template implementation plan

- [ ] **Step 1: Run release-level verification from a clean command**

Run:

```bash
pnpm run verify
```

Expected: TypeScript, ESLint, `27` tests, and Next.js production build all pass with exit code `0`.

- [ ] **Step 2: Confirm documentation and test ownership**

Run:

```powershell
rg -n "^## (Product Contract|Current Stack|Architecture Boundaries|Agent Contract|Superpowers Workflow|Testing and Definition of Done)" AGENTS.md
Get-ChildItem tests -Recurse -Filter *.test.ts | Select-Object -ExpandProperty FullName
```

Expected: every required `AGENTS.md` section exists and tests are present under admin, agents, analysis, auth, chat, contracts, docs, and reports ownership directories.

- [ ] **Step 3: Confirm Git and remote state**

Run:

```powershell
$local = git rev-parse HEAD
$remote = (git ls-remote origin refs/heads/main) -split '\s+' | Select-Object -First 1
git status --short
if ($local -ne $remote) { throw 'Local and origin/main differ' }
```

Expected: no status output and local HEAD equals `origin/main`.

- [ ] **Step 4: Request code review before Phase 1**

Invoke `superpowers:requesting-code-review` with the Phase 0 commit range. Review must focus on documentation accuracy, lost test coverage, accidental behavior changes, CI safety, and secret handling.

Expected: all blocking findings resolved and re-verified before writing `2026-08-11-luminax-role-template-foundation.md`.
