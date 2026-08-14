# LuminaX Current Architecture

## Runtime Request Flow
1. Next.js route authenticates and validates.
2. Governance Agent reviews the raw question.
3. Business Agent classifies the request and obtains an authorized data scope.
4. MySQL fixed SQL or a published custom metric executes.
5. For meaningful analysis intents, Business exposes authorized structured analysis through `onAnalysisReady` before full answer generation.
6. The insight projection validates deterministic evidence, atomically saves the latest snapshot, and returns a short receipt; projection failure falls back to the complete Business or Attribution answer.
7. The HTTP adapter emits the existing SSE protocol plus additive insight lifecycle events.

`src/app/api/chat/route.ts` delegates to `handleChatHttpRequest` in `src/modules/chat/chat-http-adapter.ts`. The adapter reads the authenticated user with `authenticateRequest`, queues live SSE callbacks from `chatApplication.execute`, and emits status, insight, content, and intent payloads in order. The additive `insight` event does not alter existing event payloads.

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
| insights | Authorized analysis projection, deterministic evidence and latest snapshot | InsightApplication, LatestInsightRepository |

- `auth`: `src/modules/auth/auth-application.ts` defines `AuthApplication`; composition exports `authApplication`, while `src/modules/auth/auth-http.ts` exposes `authenticateRequest` for routes.
- `admin/permissions`: `AccessControl` has `authorizeScope`, `evaluate`, and `filterSalesData`; `permissionAdminApplication` administers users and policies through file-backed storage.
- `admin/metrics`: `MetricAdminApplication` lists, drafts, validates, test-executes, publishes, disables, and removes custom metrics. `CustomMetricRuntime` matches only published definitions and executes their SQL through the MySQL query runner.
- `agents`: factories live in `src/modules/agents/governance/`, `business/`, `attribution/`, and `metric-authoring/`. Shared model and memory contracts are in `src/modules/agents/shared/`.
- `chat`: `ChatApplication.execute` orchestrates the Governance and Business Agents; the HTTP adapter maps authentication, application errors, and SSE output without executing SQL directly.
- `metrics`: `SqlMetricQueryExecutor` is implemented by `MySqlSqlMetricQueryExecutor`; SQL contracts reside in `src/modules/metrics/sql/mysql-metric-queries.ts`.
- `data-source`: `SalesDataSource.loadSalesData` has JSON, MySQL, and SQL Server implementations selected by `createSalesDataSource` in `src/modules/data-source/data-source-factory.ts`.
- `reports`: `WeeklyReportData` is the stable report model. `generateWeeklyReportHTML` and `generateWeeklyReportSummary` are exported from `src/modules/reports/report-engine.ts`; `formatSqlWeeklyReport` renders SQL-backed report results for chat.
- `insights`: `InsightApplication` composes and validates a projection of an authorized SQL result. `InsightComposer` uses `DEEPSEEK_INSIGHT_MODEL || DEEPSEEK_MODEL || deepseek-v4-flash` only to select controlled fact IDs and draft hypotheses or actions; it has no memory, database access, metric-calculation, or persisted-fact-authoring responsibility.

## Insight Projection Flow
1. The Business Agent invokes `onAnalysisPlanned` after intent normalization and before SQL execution. Triggerable analyses persist the user's generation token at this point, so older work cannot commit while a newer request is calculating.
2. The Business Agent invokes `onAnalysisReady` with the authorized scope, fixed-SQL result and any single attribution explanation.
3. `InsightSourceCatalog` and `EvidenceBuilder` build deterministic, traceable sources and evidence from the structured result.
4. `InsightComposer` selects allowed source and evidence IDs, prioritizes them, and drafts only hypotheses, checks and actions. It does not author formal facts.
5. `InsightValidator` verifies schema, references, quantities, units and access requirements, then generates the headline, finding copy and observed facts from the selected SQL-backed catalog entries.
6. `LatestInsightRepository` commits only when the supplied request token exactly matches the persisted per-user generation token. The default `.luminax/latest-insights.json` implementation uses an atomic rename plus a cross-process owner lock, which is reclaimed only after confirming that its process is dead; a MySQL implementation can provide the same contract with compare-and-swap.
7. `GET /api/insights/latest` returns the reauthorized public DTO. `PATCH /api/insights/latest/actions/:actionId` reauthorizes the same exact table, column and store requirements and uses `insightId` for optimistic concurrency.
8. The persisted claim emits `insight: generating`; a successful save emits `insight: updated` and a short chat receipt, while a current-request failure emits `insight: failed`, keeps the previous snapshot, and returns the complete chat answer. Each event carries an optional request generation reference; newer clients reject older events and legacy events remain parseable. The client also ignores a second toggle for the same action while its save is pending.

The internal workbench view ID remains `analysis`, while its user-facing label and content are “洞察与行动”. Overview continues to render operational KPIs and charts; Report continues to render its independently generated weekly report.

## Agent Topology
`src/modules/chat/chat-composition.ts` creates the three runtime Agents. Each has its own `DeepSeekChatModel`, its own `InMemoryAgentMemory`, and its own System Prompt; the model names can be independently configured with `DEEPSEEK_GOVERNANCE_MODEL`, `DEEPSEEK_BUSINESS_MODEL`, and `DEEPSEEK_ATTRIBUTION_MODEL`, falling back to `DEEPSEEK_MODEL`.

- The Governance Agent (治理 Agent, `createGovernanceAgent`) uses `GOVERNANCE_SYSTEM_PROMPT`, checks prompt injection and sensitive inputs locally, then returns an allow/reject decision and handoff. Invalid or unavailable model output is rejected.
- The Business Agent (业务 Agent, `createBusinessAgent`) uses `BUSINESS_SYSTEM_PROMPT`, classifies an allowed request, resolves the date and store scope, calls `AccessControl.authorizeScope`, and only then invokes SQL or a published custom metric. It asks DeepSeek to explain the structured execution result and retains a local formatter fallback.
- The Attribution Agent (归因 Agent, `createAttributionAgent`) uses `ATTRIBUTION_SYSTEM_PROMPT` and receives the already scoped attribution result from the Business Agent. `AttributionKnowledgeRetriever` is a replaceable RAG port, but runtime composition passes `NoopAttributionKnowledgeRetriever`, whose `retrieve` method returns no documents.
- The Metric SQL Authoring Agent (`createMetricSqlAuthoringAgent`) is an administration dependency, not one of the three runtime chat agents. It uses `METRIC_SQL_AUTHORING_SYSTEM_PROMPT` to generate SQL drafts for `metricAdminApplication`, which then validates and test-executes them before publication.

## SQL Metric Flow
1. `BusinessAgent.execute` classifies the question or matches a published custom metric.
2. It asks `SqlMetricQueryExecutor.listStoreIds` for the available scope and calls `AccessControl.authorizeScope` with the fixed metric requirements or custom metric table requirements.
3. For a fixed intent, `MySqlSqlMetricQueryExecutor.execute(intent, { storeIds, startDate, endDate })` executes allowlisted SQL from `mysql-metric-queries.ts` and returns a structured `SqlMetricExecution` with `source: "sql"`.
4. For a custom metric, `customMetricRuntime.execute(metricId, scope)` runs the published SQL template through `MySqlMetricQueryRunner`.
5. Business formatting, or attribution formatting for the attribution intent, receives the structured result. Agents do not calculate final metric values.

MySQL is the active fixed metric executor. The `SalesDataSource` adapter retains a SQL Server implementation at `src/modules/data-source/sqlserver-sales-data-source.ts`, but fixed SQL metric parity with SQL Server is not implemented or claimed.

## Permission Enforcement
- HTTP routes authenticate through `authenticateRequest`; the chat adapter passes the authenticated `user.id` into `ChatApplication`.
- `RepositoryAccessControl.authorizeScope` requires an active user, intersects available stores and any requested store IDs with the user policy for every required table and column, and returns the authorized subset. It rejects when no authorized scope remains; `strictStoreScope` additionally rejects requests containing unauthorized stores.
- `accessControl.filterSalesData` projects `/api/data` server-side by table policy, allowed column, and allowed store value.
- `/api/admin/metrics` and `/api/admin/permissions` require the authenticated `super_admin` role and a localhost request through `authorizeAdminRequest`.

## Runtime State
- `.luminax/` is ignored local runtime state, not source-controlled application data.
- `FilePermissionRepository` defaults to `.luminax/access-control.json`; `FileMetricDefinitionRepository` defaults to `.luminax/metric-registry.json`; `FileCredentialRepository` defaults to `.luminax/credentials.json`.
- `SessionManager` uses `.luminax/session-secret.key` unless a configured session secret or path overrides it. These locations can be overridden through the corresponding `LUMINAX_*_PATH` environment variables.
- Agent conversation memory is process-local `InMemoryAgentMemory`, capped per session and not persisted to `.luminax/`.
- Latest insight state is stored by `LatestInsightRepository` in `.luminax/latest-insights.json` by default. The ignored file contains server-only authorization requirements that are removed from public DTOs.

## Known POC Boundaries
- DeepSeek transport requires `DEEPSEEK_API_KEY`. Governance rejects when it cannot obtain a valid model decision; Business and Attribution retain their local formatting fallbacks where their code paths provide one.
- The RAG port is present for Attribution, but its current default is Noop and there is no deployed knowledge store or vector database.
- `SalesDataSource` still defaults to the JSON adapter when `LUMINAX_DATA_SOURCE` is unset. This serves `/api/data`; it does not replace the MySQL-backed fixed metric executor used by chat.
- Runtime registries are local file repositories with an in-process write queue, suitable for the local POC rather than multi-instance coordination.
- Insight composition is stateless. Generation failures preserve the previous valid snapshot, and stale generation or action responses cannot overwrite newer client-visible state.
- SQL Server remains a retained data-source interface. No full fixed-metric SQL Server parity is asserted.
