# LuminaX Local POC

LuminaX 是用于门店经营分析、归因洞察和受控指标运营的本地 POC。此文档面向本地运行与验收的操作人员；使用 `pnpm`，不使用 npm 或 yarn。

## Capabilities

- 在统一工作台中查看门店经营数据、趋势、渠道、品类、时段和退款分析。
- 使用聊天式分析获得可追溯的经营解释；配置 DeepSeek 时可补充中文解释，未配置时仍可使用本地分析结果。
- 由系统管理员维护指标登记、用户、角色、数据范围与权限策略。
- 以 MySQL 作为当前活跃的本地数据设置；`json` 仅作为演示数据回退来源。

## Architecture at a Glance

- Next.js 应用在本地端口 `5000` 运行。
- `LUMINAX_DATA_SOURCE=mysql` 时，数据访问层读取 MySQL 销售数据，固定指标和管理员指标检查也面向该数据源。
- `LUMINAX_DATA_SOURCE=json` 时，应用使用仓库内的演示数据，适合未准备 MySQL 的界面演示与排障回退。
- DeepSeek 配置是可选的解释层；业务数据、权限判定和本地指标计算不依赖它才能启动。
- 凭据、权限登记、指标登记和会话密钥等运行时状态写入被 Git 忽略的 `.luminax/` 目录。

## Prerequisites

- Node.js 20 或更高版本。
- pnpm 9 或更高版本。
- MySQL 本地实例及已加载的 LuminaX 数据集，用于正常的本地运行与数据库检查。
- 可选的 DeepSeek 服务凭据，用于生成补充分析解释。

## Install

在仓库根目录执行：

```bash
pnpm install
```

## Environment Configuration

从 `.env.example` 创建仅供本机使用的 `.env.local`，并按下列名称配置。不要提交 `.env.local`，也不要将密钥、数据库密码或管理员令牌写入 README、日志或问题单。

将 `LUMINAX_DATA_SOURCE` 设为 `mysql` 以启用当前活跃的本地数据设置。只有在需要演示回退或隔离 MySQL 问题时，才将其设为 `json`。

### DeepSeek

以下变量均来自 `.env.example`：

- `DEEPSEEK_API_KEY`：服务密钥；可留空以仅使用本地分析。
- `DEEPSEEK_MODEL`：通用解释模型。
- `DEEPSEEK_GOVERNANCE_MODEL`：治理场景模型。
- `DEEPSEEK_BUSINESS_MODEL`：经营分析模型。
- `DEEPSEEK_ATTRIBUTION_MODEL`：归因分析模型。
- `DEEPSEEK_METRIC_AUTHORING_MODEL`：指标编写模型。
- `DEEPSEEK_METRIC_AUTHORING_TIMEOUT_MS`：指标编写请求超时。
- `DEEPSEEK_BASE_URL`：服务端点。
- `DEEPSEEK_TIMEOUT_MS`：通用请求超时。

### MySQL

MySQL 是本地运行、MySQL 数据检查与 SQL 指标检查的活跃配置。设置 `LUMINAX_DATA_SOURCE=mysql`，并配置以下变量：

- `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_DATABASE`：数据库连接位置与数据库名。
- `MYSQL_USERNAME`、`MYSQL_PASSWORD`：数据库身份凭据。
- `MYSQL_SSL`、`MYSQL_SSL_CA`、`MYSQL_SSL_REJECT_UNAUTHORIZED`：TLS 行为。
- `MYSQL_CONNECTION_LIMIT`、`MYSQL_CONNECT_TIMEOUT_MS`、`MYSQL_QUERY_TIMEOUT_MS`、`MYSQL_CACHE_TTL_MS`：连接、查询与缓存控制。

### SQL Server Interface

`sqlserver` 是数据源工厂保留的适配器接口，不是当前活跃的本地设置。它没有随本 POC 提供与 MySQL 等价的配置、数据集、检查命令或结果保证；不要将其表述为具有 MySQL 的功能或指标校验一致性。需要演示回退时使用 `json`，需要正常本地运行时使用 `mysql`。

### Runtime State

- `LUMINAX_DATA_SOURCE`：选择 `mysql` 作为活跃本地设置，或选择 `json` 作为演示回退来源。
- `LUMINAX_ADMIN_TOKEN`：可选的管理员 API 令牌；为空时，管理员 API 仅接受 localhost 请求。
- `LUMINAX_METRIC_REGISTRY_PATH`：可选的自定义指标登记路径。
- 默认情况下，凭据登记、权限登记、指标登记和会话密钥位于被 Git 忽略的 `.luminax/` 下。不要提交、共享或手工发布这些文件。

## First Login

使用部署负责人以受控方式提供的初始管理员凭据登录 `/login`；本运行手册不记录或分发默认密码。首次成功登录会将凭据以哈希形式写入 `.luminax/`。随后立即在管理员界面确认系统管理员、创建所需用户、分配角色和数据范围，并为每个新增用户设置符合要求的独立密码。

## Run Locally

完成 MySQL 和 `.env.local` 配置后，运行：

```bash
pnpm dev
```

打开 [http://localhost:5000](http://localhost:5000)。如需按生产模式启动已构建的应用，先完成构建，再运行：

```bash
pnpm start
```

## Validate and Build

运行完整的静态检查与模块接口测试：

```bash
pnpm run validate
```

单独运行模块接口测试：

```bash
pnpm test
```

构建生产产物：

```bash
pnpm build
```

## Database Checks

这些检查读取本机 `.env.local` 中的 MySQL 配置；运行前确认其指向正确的本地实例。它们适用于 MySQL，不表示 SQL Server 适配器具有相同验证覆盖。

```bash
pnpm run test:mysql
pnpm run test:sql-metrics
pnpm run test:admin-metrics
```

- `pnpm run test:mysql` 验证所需销售数据表有数据且门店 ID 已规范化。
- `pnpm run test:sql-metrics` 验证 MySQL 固定指标 SQL、确定性结果和既有计算结果。
- `pnpm run test:admin-metrics` 验证管理员自定义指标 SQL 的受控执行。

## Repository Structure

```text
src/
  app/                  Next.js 页面和 API 路由
  components/           工作台、认证和管理界面组件
  modules/              认证、权限、指标、数据源和分析应用层
scripts/                MySQL 和指标检查脚本
tests/                  模块接口测试
public/                 JSON 演示数据与静态资源
.luminax/               被忽略的本地运行时状态
```

## Security Notes

- `.env.local` 和 `.luminax/` 均为本地敏感状态，必须保持在版本控制之外。
- 不要在终端输出、截图、日志、聊天记录或文档中暴露 `DEEPSEEK_API_KEY`、`MYSQL_PASSWORD` 或 `LUMINAX_ADMIN_TOKEN`。
- 管理员权限、指标编写和数据范围应遵循最小权限原则；禁用用户后应验证其无法继续访问。
- 管理员 API 在设置 `LUMINAX_ADMIN_TOKEN` 时需要令牌，在令牌为空时仅限 localhost 请求。

## Troubleshooting

- 应用启动后没有 MySQL 数据：确认 `LUMINAX_DATA_SOURCE=mysql`，再检查 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_DATABASE` 与数据库凭据，并运行 `pnpm run test:mysql`。
- 需要在没有 MySQL 的机器上演示：将 `LUMINAX_DATA_SOURCE` 设为 `json`。这是回退模式，不应用于 MySQL 指标验收。
- DeepSeek 解释不可用：检查 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL` 和超时变量；本地分析仍应可用。
- 无法进入管理页：确认使用系统管理员账户登录，检查用户是否处于活动状态及其 `.luminax/` 权限登记。
- 初始登录或后续登录失败：向部署负责人索取受控凭据；不要在文档或工单中尝试记录或传播密码。
