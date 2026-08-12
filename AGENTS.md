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
- `src/app/api/chat/route.ts` delegates `POST` to `handleChatHttpRequest` in `src/modules/chat/chat-http-adapter.ts`; the adapter authenticates the request, calls `chatApplication.execute`, and preserves the SSE response from `streamChatResponse`.
- `src/app/api/data/route.ts` authenticates, loads `salesDataRepository`, and projects it with `accessControl.filterSalesData`.
- `src/app/api/workbench/context/route.ts` exposes the authenticated, non-cacheable workbench context without returning raw table, column, SQL, or credential details.
- `src/app/api/auth/login/route.ts`, `logout/route.ts`, and `me/route.ts` are the public session endpoints. `src/app/api/admin/metrics/route.ts` and `src/app/api/admin/permissions/route.ts` validate action payloads and require `authorizeAdminRequest`.

### Application use cases
- `chatApplication` in `src/modules/chat/chat-composition.ts` implements `ChatApplication.execute(command: ChatCommand): Promise<ChatResult>` from `src/modules/chat/chat-application.ts`.
- `authApplication` in `src/modules/auth/auth-composition.ts` implements `AuthApplication` from `src/modules/auth/auth-application.ts`; `authenticateRequest` is the HTTP-facing session helper in `src/modules/auth/auth-http.ts`.
- `permissionAdminApplication` in `src/modules/admin/permissions/permission-composition.ts` and `metricAdminApplication` in `src/modules/admin/metrics/metric-composition.ts` are the administration use cases.
- `workbenchContextApplication` in `src/modules/workbench/workbench-composition.ts` resolves role templates and projects existing metric and data permissions into the client-safe `WorkbenchContext` contract.

### Agents
- Runtime chat composition in `src/modules/chat/chat-composition.ts` creates Governance, Business, and Attribution Agents with separate `DeepSeekChatModel` and `InMemoryAgentMemory` instances.
- Public factories are `createGovernanceAgent`, `createBusinessAgent`, `createAttributionAgent`, and `createMetricSqlAuthoringAgent` under `src/modules/agents/`.
- Shared contracts are `AgentModel` and `AgentMemory` in `src/modules/agents/shared/`; DeepSeek transport is `DeepSeekChatModel`.

### Metrics and SQL
- Fixed metric execution uses `SqlMetricQueryExecutor.execute(intent, scope)` from `src/modules/metrics/sql-metric-query-executor.ts`, implemented by `MySqlSqlMetricQueryExecutor` in `src/modules/metrics/sql/mysql-sql-metric-query-executor.ts`.
- The allowlisted fixed SQL contracts live in `src/modules/metrics/sql/mysql-metric-queries.ts` and return structured results for business, attribution, and report intents.
- Published custom metrics use `CustomMetricRuntime.match` and `CustomMetricRuntime.execute` in `src/modules/admin/metrics/custom-metric-runtime.ts`; `metricAdminApplication` validates and test-executes SQL before publishing.

### Permissions and authentication
- `AccessControl.authorizeScope`, `evaluate`, and `filterSalesData` in `src/modules/admin/permissions/access-control.ts` enforce active user, table, column, and store-value access on the server.
- Password credentials are managed by `AuthApplication`, `FileCredentialRepository`, and `SessionManager`; `luminax_session` is an HTTP-only, strict same-site session cookie.

### Reports and visualization
- `src/modules/reports/report-engine.ts` exposes `generateWeeklyReportSummary` and `generateWeeklyReportHTML`; the stable report model is `WeeklyReportData` in `src/modules/reports/report-model.ts`.
- `POST /api/reports/weekly` generates report HTML on the server. DeepSeek may rewrite only the trend summary and attention sections from aggregate `WeeklyReportData`; SQL-derived values remain authoritative and invalid or unavailable model output silently falls back to deterministic report copy.
- `src/modules/reports/sql-report-formatter.ts` formats SQL-backed report results. Dashboard chart options are built by `buildDashboardChartOptions` in `src/modules/visualization/chart-options.ts` for the ECharts UI.

### Runtime repositories
- `.luminax/` is ignored local runtime state. `FilePermissionRepository`, `FileMetricDefinitionRepository`, `FileCredentialRepository`, and `SessionManager` use it by default for access control, metric registry, credentials, and the session secret.
- `SalesDataSource` in `src/modules/data-source/data-source.ts` is the adapter contract. JSON, MySQL, and SQL Server implementations are selected by `createSalesDataSource`; fixed metric execution remains MySQL-backed.

## Non-Negotiable Data Rules
- Fixed and published custom metric values are calculated by SQL, not by an Agent.
- Agents select intent, store scope, date range, and presentation; they do not invent final numeric values.
- Every data request is authorized on the server by table, column, and store value.
- Attribution receives only data that was already scoped and authorized.

## Agent Contract
### Governance Agent (治理 Agent)
- `createGovernanceAgent` in `src/modules/agents/governance/governance-agent.ts` exposes `review(request): Promise<GovernanceResult>` and either rejects a request or returns a `GovernanceHandoff` for the Business Agent.
- It uses its own configured DeepSeek model (`DEEPSEEK_GOVERNANCE_MODEL` or `DEEPSEEK_MODEL`), its own `InMemoryAgentMemory`, and `GOVERNANCE_SYSTEM_PROMPT` from `src/modules/agents/prompts/governance-system-prompt.ts`.
- Local prompt-injection and sensitive-input checks run before model review. Missing or invalid governance model output rejects the request.

### Business Agent (业务 Agent)
- `createBusinessAgent` in `src/modules/agents/business/business-agent.ts` exposes `execute(request): Promise<BusinessAgentResult>`.
- It uses its own configured DeepSeek model (`DEEPSEEK_BUSINESS_MODEL` or `DEEPSEEK_MODEL`), its own `InMemoryAgentMemory`, and `BUSINESS_SYSTEM_PROMPT` from `src/modules/agents/prompts/business-system-prompt.ts`.
- It classifies the request, obtains an authorized scope through `AccessControl.authorizeScope`, executes a fixed MySQL metric or published custom metric, then explains only the structured result. It delegates attribution explanation to the Attribution Agent.

### Attribution Agent (归因 Agent)
- `createAttributionAgent` in `src/modules/agents/attribution/attribution-agent.ts` exposes `analyze(request): Promise<string>`.
- It uses its own configured DeepSeek model (`DEEPSEEK_ATTRIBUTION_MODEL` or `DEEPSEEK_MODEL`), its own `InMemoryAgentMemory`, and `ATTRIBUTION_SYSTEM_PROMPT` from `src/modules/agents/prompts/attribution-system-prompt.ts`.
- Its `AttributionKnowledgeRetriever` port is defined in `src/modules/agents/attribution/attribution-rag.ts`; runtime composition currently supplies `NoopAttributionKnowledgeRetriever`, so RAG defaults to Noop and attribution explains only the already authorized structured data plus its local fallback.

### Metric SQL Authoring Agent
- `createMetricSqlAuthoringAgent` in `src/modules/agents/metric-authoring/metric-sql-authoring-agent.ts` exposes `generate(input): Promise<GeneratedMetricSql>` for the metric administration flow.
- It uses `DEEPSEEK_METRIC_AUTHORING_MODEL` or `DEEPSEEK_MODEL` and `METRIC_SQL_AUTHORING_SYSTEM_PROMPT` to author a draft. It is not a runtime numeric executor and does not publish SQL itself.
- `metricAdminApplication.generateSql`, `validateSql`, `testSql`, and `publish` retain validation, read-only allowlisting, scope compilation, and test execution as the publication gate.

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
