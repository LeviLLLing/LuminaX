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
- `src/app/api/chat/route.ts` delegates `POST` to `handleChatHttpRequest` in `src/modules/chat/chat-http-adapter.ts`; `handleChatHttpRequest` queues live SSE callbacks from `chatApplication.execute` and emits status, insight, content, and intent events without changing their existing payloads.
- `src/app/api/data/route.ts` authenticates, loads `salesDataRepository`, and projects it with `accessControl.filterSalesData`.
- `src/app/api/workbench/context/route.ts` exposes the authenticated, non-cacheable workbench context without returning raw table, column, SQL, or credential details.
- `src/app/api/auth/login/route.ts`, `logout/route.ts`, and `me/route.ts` are the public session endpoints. `src/app/api/admin/metrics/route.ts` and `src/app/api/admin/permissions/route.ts` validate action payloads and require `authorizeAdminRequest`.

### Application use cases
- `chatApplication` in `src/modules/chat/chat-composition.ts` implements `ChatApplication.execute(command: ChatCommand): Promise<ChatResult>` from `src/modules/chat/chat-application.ts`.
- `authApplication` in `src/modules/auth/auth-composition.ts` implements `AuthApplication` from `src/modules/auth/auth-application.ts`; `authenticateRequest` is the HTTP-facing session helper in `src/modules/auth/auth-http.ts`.
- `permissionAdminApplication` in `src/modules/admin/permissions/permission-composition.ts` and `metricAdminApplication` in `src/modules/admin/metrics/metric-composition.ts` are the administration use cases.
- `workbenchContextApplication` in `src/modules/workbench/workbench-composition.ts` resolves role templates and projects existing metric and data permissions into the client-safe `WorkbenchContext` contract.
- The Business Agent exposes authorized structured analysis through `onAnalysisReady` before full answer generation. The chat application may project that result into a latest insight and otherwise continues the existing answer path.

### Agents
- Runtime chat composition in `src/modules/chat/chat-composition.ts` creates Governance, Business, and Attribution Agents with separate `DeepSeekChatModel` and `InMemoryAgentMemory` instances.
- Public factories are `createGovernanceAgent`, `createBusinessAgent`, `createAttributionAgent`, and `createMetricSqlAuthoringAgent` under `src/modules/agents/`.
- Shared contracts are `AgentModel` and `AgentMemory` in `src/modules/agents/shared/`; DeepSeek transport is `DeepSeekChatModel`.
- `InsightComposer` is a projection component, not a fourth runtime Agent. It uses `DEEPSEEK_INSIGHT_MODEL || DEEPSEEK_MODEL || deepseek-v4-flash`, has no Agent memory, does not access the database, and never calculates metrics.

### Insight projection
- `InsightApplication` consumes only authorized structured analysis. `InsightComposer` may select catalog IDs and draft hypotheses or actions, while the validator derives every persisted headline, finding title, finding summary, and observed fact from the deterministic SQL source catalog.
- `LatestInsightRepository` defaults to `.luminax/latest-insights.json`. The file repository persists per-user generation tokens and serializes all instances in the local Node process. It is intentionally a single-process POC store; horizontal or multi-process deployment must replace it with a MySQL CAS implementation through the same interface.
- `GET /api/insights/latest` restores the current user's latest snapshot. `PATCH /api/insights/latest/actions/:actionId` updates one action using the current insight ID for optimistic concurrency.
- Both routes reauthorize the exact stored table, column, and store requirements before returning or mutating a snapshot. Authorization failure hides the full snapshot rather than returning a partial result.
- Insight generation adds `generating`, `updated`, and `failed` lifecycle events to SSE. New events carry an optional `generation` reference for wire compatibility, and the client rejects events older than the latest observed generation. A triggerable analysis starts its lifecycle when its token is persisted before SQL; every current-request exit reaches `updated` or `failed`, while superseded requests exit silently.

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
- `.luminax/` is ignored local runtime state. `FilePermissionRepository`, `FileMetricDefinitionRepository`, `FileCredentialRepository`, `LatestInsightRepository`, and `SessionManager` use it by default for access control, metric registry, credentials, latest insights, and the session secret.
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
- The internal `analysis` view ID remains stable but presents “洞察与行动”. Overview and Report keep independent data and rendering paths.

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
