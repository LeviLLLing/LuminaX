# LuminaX-灵犀经营智能引擎

## 项目概述

单页面 Web 应用，实现门店销售数据的自然语言查询、图表联动、多级归因分析和智能周报生成。

### 核心原则

- **代码算数，本地解释**：所有数值计算由 JavaScript 完成，本地规则负责意图理解和结果输出
- **本地可运行**：聊天接口不依赖外部 LLM 服务，安装依赖后可直接用 `pnpm dev` 启动
- **对话驱动看板**：用户提问后，左侧图表自动切换（单店→饼图，多店→柱状图）
- **数据不可变**：所有分析基于固定的 sales_data.json 源数据

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Charts**: ECharts 5
- **Analysis API**: 本地规则识别 + JavaScript 计算

## 目录结构

```
├── public/
│   └── sales_data.json         # 门店销售数据（10张表，5店×14天）
├── src/
│   ├── app/
│   │   ├── api/chat/route.ts   # 本地流式分析 API（规则识别 + 8 项专项分析）
│   │   ├── globals.css         # 全局样式
│   │   ├── layout.tsx          # 根布局
│   │   └── page.tsx            # 主页面（仪表盘 + 对话面板）
│   ├── components/ui/          # Shadcn UI 组件库
│   ├── hooks/                  # 自定义 Hooks
│   └── lib/
│       ├── data.ts             # 数据层：加载、筛选、计算、8 项专项分析、周报生成
│       ├── nlu.ts              # NLU 层：规则降级（实体提取、意图分类）
│       ├── types.ts            # 类型定义
│       └── utils.ts            # 通用工具函数
├── DESIGN.md                   # 设计规范
├── AGENTS.md                   # 本文件
├── next.config.ts
├── package.json
└── tsconfig.json
```

## 数据结构

sales_data.json 包含 10 张表（门店ID已脱敏为 S001-S005）：

| 表名 | 说明 | 记录数 |
|------|------|--------|
| store_master | 门店主数据 | 5 |
| store_sales_daily | 每日销售 | 70 |
| sales_target_daily | 每日目标 | 70 |
| sales_by_channel | 渠道销售（Dine-in/Takeaway/Delivery） | 210 |
| sales_by_daypart | 时段销售（Breakfast/Lunch/Afternoon Tea/Dinner） | 280 |
| sales_by_category | 品类销售（Burger/Fried Chicken/Beverage/Combo Meal/Snack） | 350 |
| promotion_daily | 促销数据 | 90 |
| refund_cancel_daily | 退款数据 | 70 |
| store_manager_feedback | 店长反馈 | 7 |
| store_sales_attribution_dataset | 归因数据集 | 70 |

## 门店映射（脱敏后）

| 门店ID | 门店名称 |
|--------|----------|
| S001 | 上海商场店 |
| S002 | 办公园区店 |
| S003 | 大学城店 |
| S004 | 地铁站店 |
| S005 | 社区中心店 |

## 核心功能模块

### 本地意图理解
- 规则识别用户意图并提取实体（门店ID、门店名称、日期范围）
- JS 精确计算数据
- SSE 返回结构化意图和 Markdown 分析结果

### 8 项专项分析
- achievement_rate: 销售达成率
- order_trend: 订单数变化趋势
- aov_trend: 客单价变化趋势
- channel_mix: 渠道占比
- daypart_analysis: 分时段表现
- promotion_contribution: 促销贡献
- refund_rate: 退款率
- anomaly_detection: 异常日期检测

### 智能周报生成
- 汇总全量数据，计算各门店排名
- 标记异常门店（达成率 < 100%）
- 支持动态日期范围
- 输出结构化周报（HTML + 摘要文本）

### 多级归因分析
- Level 0: 总体达成率检查
- Level 1: 订单量 vs 客单价拆解
- Level 2: 渠道/品类维度分析
- Level 3: 时段分析
- Level 4: 交叉验证（退款 + 店长反馈）

### 对话驱动的图表联动
- 纯聊天模式（默认全宽）
- 周报模式：左侧周报 HTML，右侧对话
- BI 看板模式：左侧 ECharts 图表，右侧对话

## 包管理规范

**仅允许使用 pnpm**，严禁 npm 或 yarn。

```bash
pnpm add <package>       # 安装依赖
pnpm add -D <package>    # 安装开发依赖
pnpm install             # 安装所有依赖
pnpm remove <package>    # 移除依赖
```

## 开发规范

### 编码规范
- TypeScript strict 模式
- 禁止隐式 any 和 as any
- 函数参数、返回值、事件对象需有明确类型
- 清理未使用的变量和导入

### Hydration 问题防范
- 严禁在 JSX 中直接使用 typeof window、Date.now()、Math.random()
- 必须使用 'use client' + useEffect + useState 确保动态内容仅在客户端渲染
- 严禁非法 HTML 嵌套（如 <p> 嵌套 <div>）

### next.config 配置规范
- 配置路径使用 path.resolve(__dirname, ...) 或 process.cwd() 动态拼接

### UI 组件规范
- 默认采用 shadcn/ui 组件、风格和规范
- 品牌色通过常量注入（BRAND_YELLOW: #FFE600）

## API 接口

### POST /api/chat

请求体：
```json
{
  "question": "S001 上周的销售额",
  "storeIds": ["S001"],
  "startDate": "2025-05-01",
  "endDate": "2025-05-14"
}
```

响应：SSE 流式输出
```
data: {"type":"intent","intent":"achievement_rate","storeIds":["S001"],"startDate":"2025-05-01","endDate":"2025-05-14"}
data: {"type":"content","content":"分析内容..."}
data: {"type":"content","content":"更多内容..."}
data: [DONE]
```

意图处理逻辑：
- 8 项专项意图 → JS 计算数据 → 本地 Markdown 解释
- attribution → 多级归因数据计算 → 本地归因摘要
- report → 周报 HTML 生成 + 摘要文本
- compare → 本地生成对比表格 + 数据摘要注入
- irrelevant → 引导消息

## 常用命令

```bash
pnpm dev          # 启动开发环境
pnpm build        # 构建生产版本
pnpm start        # 启动生产环境
pnpm ts-check     # TypeScript 类型检查
pnpm lint         # ESLint 检查
```
