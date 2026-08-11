# LuminaX Current Architecture

## Runtime Request Flow
1. Next.js route authenticates and validates.
2. Governance Agent reviews the raw question.
3. Business Agent classifies the request and obtains an authorized data scope.
4. MySQL fixed SQL or a published custom metric executes.
5. Business or Attribution Agent explains the structured result.
6. The HTTP adapter emits the existing SSE protocol.

`src/app/api/chat/route.ts` delegates to `handleChatHttpRequest` in `src/modules/chat/chat-http-adapter.ts`. The adapter reads the authenticated user with `authenticateRequest`, calls `chatApplication.execute`, and converts the `ChatResult` into `intent`, `content`, and `[DONE]` SSE events through `streamChatResponse` in `src/modules/chat/sse-response.ts`.

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

- `auth`: `src/modules/auth/auth-application.ts` defines `AuthApplication`; composition exports `authApplication`, while `src/modules/auth/auth-http.ts` exposes `authenticateRequest` for routes.
- `admin/permissions`: `AccessControl` has `authorizeScope`, `evaluate`, and `filterSalesData`; `permissionAdminApplication` administers users and policies through file-backed storage.
- `admin/metrics`: `MetricAdminApplication` lists, drafts, validates, test-executes, publishes, disables, and removes custom metrics. `CustomMetricRuntime` matches only published definitions and executes their SQL through the MySQL query runner.
- `agents`: factories live in `src/modules/agents/governance/`, `business/`, `attribution/`, and `metric-authoring/`. Shared model and memory contracts are in `src/modules/agents/shared/`.
- `chat`: `ChatApplication.execute` orchestrates the Governance and Business Agents; the HTTP adapter maps authentication, application errors, and SSE output without executing SQL directly.
- `metrics`: `SqlMetricQueryExecutor` is implemented by `MySqlSqlMetricQueryExecutor`; SQL contracts reside in `src/modules/metrics/sql/mysql-metric-queries.ts`.
- `data-source`: `SalesDataSource.loadSalesData` has JSON, MySQL, and SQL Server implementations selected by `createSalesDataSource` in `src/modules/data-source/data-source-factory.ts`.
- `reports`: `WeeklyReportData` is the stable report model. `generateWeeklyReportHTML` and `generateWeeklyReportSummary` are exported from `src/modules/reports/report-engine.ts`; `formatSqlWeeklyReport` renders SQL-backed report results for chat.

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
- `RepositoryAccessControl.authorizeScope` requires an active user and intersects the requested stores with the user policy for every required table and column. A strict request containing an unauthorized store is rejected.
- `accessControl.filterSalesData` projects `/api/data` server-side by table policy, allowed column, and allowed store value.
- `/api/admin/metrics` and `/api/admin/permissions` require the authenticated `super_admin` role and a localhost request through `authorizeAdminRequest`.

## Runtime State
- `.luminax/` is ignored local runtime state, not source-controlled application data.
- `FilePermissionRepository` defaults to `.luminax/access-control.json`; `FileMetricDefinitionRepository` defaults to `.luminax/metric-registry.json`; `FileCredentialRepository` defaults to `.luminax/credentials.json`.
- `SessionManager` uses `.luminax/session-secret.key` unless a configured session secret or path overrides it. These locations can be overridden through the corresponding `LUMINAX_*_PATH` environment variables.
- Agent conversation memory is process-local `InMemoryAgentMemory`, capped per session and not persisted to `.luminax/`.

## Known POC Boundaries
- DeepSeek transport requires `DEEPSEEK_API_KEY`. Governance rejects when it cannot obtain a valid model decision; Business and Attribution retain their local formatting fallbacks where their code paths provide one.
- The RAG port is present for Attribution, but its current default is Noop and there is no deployed knowledge store or vector database.
- `SalesDataSource` still defaults to the JSON adapter when `LUMINAX_DATA_SOURCE` is unset. This serves `/api/data`; it does not replace the MySQL-backed fixed metric executor used by chat.
- Runtime registries are local file repositories with an in-process write queue, suitable for the local POC rather than multi-instance coordination.
- SQL Server remains a retained data-source interface. No full fixed-metric SQL Server parity is asserted.
