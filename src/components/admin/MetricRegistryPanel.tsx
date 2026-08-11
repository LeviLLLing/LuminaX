"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Database,
  Edit3,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  METRIC_CATEGORIES,
  METRIC_SOURCE_TABLES,
  METRIC_UNITS,
  type CustomMetricDefinition,
  type MetricDefinitionInput,
  type MetricQueryResult,
  type MetricSqlValidation,
  type RegisteredMetricDefinition,
} from "@/modules/admin/metrics/metric-definition";
import {
  DEFAULT_END_DATE,
  DEFAULT_START_DATE,
} from "@/modules/domain/constants";

const CATEGORY_LABELS: Record<(typeof METRIC_CATEGORIES)[number], string> = {
  sales: "销售",
  order: "订单",
  customer: "顾客",
  channel: "渠道",
  promotion: "促销",
  risk: "风险",
  operations: "经营",
};

const UNIT_LABELS: Record<(typeof METRIC_UNITS)[number], string> = {
  number: "数值",
  currency: "金额",
  percentage: "百分比",
  count: "计数",
};

const SOURCE_TABLE_LABELS: Record<(typeof METRIC_SOURCE_TABLES)[number], string> = {
  store_sales_daily: "日销售主表",
  sales_target_daily: "日目标表",
  sales_by_channel: "渠道销售表",
  sales_by_daypart: "时段销售表",
  sales_by_category: "品类销售表",
  promotion_daily: "促销表",
  refund_cancel_daily: "退款取消表",
  store_manager_feedback: "店长反馈表",
  store_master: "门店主表",
  store_sales_attribution_dataset: "归因数据集",
};

const DEFAULT_SCOPE = {
  storeIds: ["S001", "S002", "S003", "S004", "S005"],
  startDate: DEFAULT_START_DATE,
  endDate: DEFAULT_END_DATE,
};

export function MetricRegistryPanel() {
  const [metrics, setMetrics] = useState<RegisteredMetricDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<"all" | "system" | "custom">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<MetricDefinitionInput>(createEmptyMetric());
  const [aliasText, setAliasText] = useState("");
  const [validation, setValidation] = useState<MetricSqlValidation | null>(null);
  const [testResult, setTestResult] = useState<MetricQueryResult | null>(null);
  const [authoringNote, setAuthoringNote] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomMetricDefinition | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await adminRequest<{ metrics: RegisteredMetricDefinition[] }>();
      setMetrics(payload.metrics);
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  const filteredMetrics = useMemo(() => {
    const query = search.trim().toLowerCase();
    return metrics.filter((metric) => {
      if (originFilter !== "all" && metric.origin !== originFilter) return false;
      if (!query) return true;
      return [metric.name, metric.code, metric.description, ...metric.aliases]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [metrics, originFilter, search]);

  const summary = useMemo(
    () => ({
      total: metrics.length,
      system: metrics.filter((metric) => metric.origin === "system").length,
      published: metrics.filter((metric) => metric.status === "published").length,
      pending: metrics.filter(
        (metric) => metric.status === "draft" || metric.status === "validated"
      ).length,
    }),
    [metrics]
  );

  function openCreate() {
    setForm(createEmptyMetric());
    setAliasText("");
    setValidation(null);
    setTestResult(null);
    setAuthoringNote("");
    setEditorOpen(true);
  }

  function openEdit(metric: CustomMetricDefinition) {
    setForm({
      id: metric.id,
      code: metric.code,
      name: metric.name,
      description: metric.description,
      aliases: metric.aliases,
      category: metric.category,
      unit: metric.unit,
      precision: metric.precision,
      requestedTables: metric.requestedTables,
      sqlTemplate: metric.sqlTemplate,
    });
    setAliasText(metric.aliases.join("、"));
    setValidation(
      metric.validation
        ? {
            valid: true,
            errors: [],
            tables: metric.validation.tables,
            outputColumns: metric.validation.outputColumns,
          }
        : null
    );
    setTestResult(null);
    setAuthoringNote("");
    setEditorOpen(true);
  }

  function preparedForm(): MetricDefinitionInput {
    return {
      ...form,
      aliases: aliasText
        .split(/[、,，\n]/)
        .map((alias) => alias.trim())
        .filter(Boolean),
    };
  }

  async function handleGenerateSql() {
    await withBusy("generate", async () => {
      const payload = await adminRequest<{
        draft: {
          sqlTemplate: string;
          explanation: string;
          assumptions: string[];
          validation: MetricSqlValidation;
        };
      }>({ action: "generate", metric: preparedForm() });
      setForm((current) => ({ ...current, sqlTemplate: payload.draft.sqlTemplate }));
      setValidation(payload.draft.validation);
      setTestResult(null);
      setAuthoringNote(
        [payload.draft.explanation, ...payload.draft.assumptions].filter(Boolean).join("；")
      );
      if (payload.draft.validation.valid) toast.success("SQL 已生成并通过静态校验");
      else toast.warning("SQL 已生成，请处理校验问题");
    });
  }

  async function handleSave() {
    await withBusy("save", async () => {
      const payload = await adminRequest<{ metric: CustomMetricDefinition }>({
        action: "save",
        metric: preparedForm(),
      });
      setForm((current) => ({ ...current, id: payload.metric.id }));
      await loadMetrics();
      toast.success("指标草稿已保存");
    });
  }

  async function handleValidate() {
    await withBusy("validate", async () => {
      const payload = await adminRequest<{ validation: MetricSqlValidation }>({
        action: "validate",
        sqlTemplate: form.sqlTemplate,
        requestedTables: form.requestedTables,
      });
      setValidation(payload.validation);
      setTestResult(null);
      if (payload.validation.valid) toast.success("SQL 静态校验通过");
      else toast.error(payload.validation.errors[0] || "SQL 校验失败");
    });
  }

  async function handleTest() {
    await withBusy("test", async () => {
      const payload = await adminRequest<{ result: MetricQueryResult }>({
        action: "test",
        sqlTemplate: form.sqlTemplate,
        requestedTables: form.requestedTables,
        scope: DEFAULT_SCOPE,
      });
      setTestResult(payload.result);
      toast.success(`试运行成功，返回 ${payload.result.rowCount} 行`);
    });
  }

  async function handlePublish() {
    await withBusy("publish", async () => {
      const payload = await adminRequest<{
        metric: CustomMetricDefinition;
        testResult: MetricQueryResult;
      }>({
        action: "publish",
        metric: preparedForm(),
        scope: DEFAULT_SCOPE,
      });
      setForm((current) => ({ ...current, id: payload.metric.id }));
      setTestResult(payload.testResult);
      setValidation({
        valid: true,
        errors: [],
        tables: payload.metric.validation?.tables || [],
        outputColumns: payload.metric.validation?.outputColumns || [],
      });
      await loadMetrics();
      toast.success("指标已发布，业务 Agent 可立即调用");
    });
  }

  async function handleToggle(metric: CustomMetricDefinition, enabled: boolean) {
    await withBusy(`toggle:${metric.id}`, async () => {
      if (enabled) {
        await adminRequest({ action: "publish", metric, scope: DEFAULT_SCOPE });
        toast.success("指标已启用");
      } else {
        await adminRequest({ action: "disable", id: metric.id });
        toast.success("指标已停用");
      }
      await loadMetrics();
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await withBusy(`delete:${deleteTarget.id}`, async () => {
      await adminRequest({ action: "remove", id: deleteTarget.id });
      setDeleteTarget(null);
      await loadMetrics();
      toast.success("自定义指标已删除");
    });
  }

  async function withBusy(action: string, operation: () => Promise<void>) {
    setBusyAction(action);
    try {
      await operation();
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-xl font-semibold text-zinc-950">指标注册表</h1>
            <p className="mt-1 text-sm text-zinc-500">固定指标与管理员发布指标</p>
          </div>
          <Button onClick={openCreate} className="bg-[#18181b] text-white hover:bg-zinc-800">
            <Plus className="size-4" />
            新增指标
          </Button>
        </div>

        <div className="mb-5 grid grid-cols-2 border border-zinc-200 bg-white sm:grid-cols-4">
          <SummaryItem label="全部指标" value={summary.total} />
          <SummaryItem label="系统内置" value={summary.system} />
          <SummaryItem label="已发布" value={summary.published} tone="success" />
          <SummaryItem label="待处理" value={summary.pending} tone="warning" />
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索指标名称或编码"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={originFilter} onValueChange={(value) => setOriginFilter(value as typeof originFilter)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部来源</SelectItem>
                  <SelectItem value="system">系统内置</SelectItem>
                  <SelectItem value="custom">管理员创建</SelectItem>
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => void loadMetrics()} disabled={loading}>
                    <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                    <span className="sr-only">刷新</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>刷新指标</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50 hover:bg-zinc-50">
                <TableHead className="min-w-56 pl-4">指标</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>来源</TableHead>
                <TableHead className="min-w-48">数据表</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>启用</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-zinc-400" />
                  </TableCell>
                </TableRow>
              ) : filteredMetrics.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-sm text-zinc-500">
                    没有符合条件的指标
                  </TableCell>
                </TableRow>
              ) : (
                filteredMetrics.map((metric) => (
                  <TableRow key={metric.id}>
                    <TableCell className="pl-4">
                      <div className="font-medium text-zinc-900">{metric.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-zinc-400">{metric.code}</div>
                    </TableCell>
                    <TableCell>{CATEGORY_LABELS[metric.category]}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-md font-normal">
                        {metric.origin === "system" ? "系统" : "管理员"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-56 items-center gap-1 overflow-hidden text-xs text-zinc-500">
                        <Database className="size-3.5 shrink-0" />
                        <span className="truncate">{metric.requestedTables.slice(0, 2).join("、")}</span>
                        {metric.requestedTables.length > 2 && <span>+{metric.requestedTables.length - 2}</span>}
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={metric.status} /></TableCell>
                    <TableCell>
                      <Switch
                        checked={metric.status === "system" || metric.status === "published"}
                        disabled={metric.origin === "system" || busyAction === `toggle:${metric.id}`}
                        onCheckedChange={(checked) =>
                          metric.origin === "custom" && void handleToggle(metric, checked)
                        }
                        aria-label={`${metric.name}启用状态`}
                      />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {metric.origin === "custom" && (
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon-sm" onClick={() => openEdit(metric)}>
                                <Edit3 className="size-4" />
                                <span className="sr-only">编辑</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>编辑指标</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => setDeleteTarget(metric)}
                              >
                                <Trash2 className="size-4" />
                                <span className="sr-only">删除</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>删除指标</TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="flex h-[92dvh] max-h-[920px] w-[calc(100%-1rem)] max-w-[1180px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1180px]">
          <DialogHeader className="border-b border-zinc-200 px-5 py-4">
            <DialogTitle>{form.id ? "编辑指标" : "新增指标"}</DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              <Bot className="size-4" />
              DeepSeek SQL 编写 Agent
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[380px_minmax(0,1fr)] lg:overflow-hidden">
            <div className="space-y-5 border-b border-zinc-200 p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r">
              <div className="grid grid-cols-2 gap-4">
                <Field label="指标名称" className="col-span-2">
                  <Input aria-label="指标名称" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </Field>
                <Field label="指标编码" className="col-span-2 sm:col-span-1">
                  <Input aria-label="指标编码" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="font-mono" />
                </Field>
                <Field label="指标分类" className="col-span-2 sm:col-span-1">
                  <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value as MetricDefinitionInput["category"] })}>
                    <SelectTrigger aria-label="指标分类" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METRIC_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{CATEGORY_LABELS[category]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="单位">
                  <Select value={form.unit} onValueChange={(value) => setForm({ ...form, unit: value as MetricDefinitionInput["unit"] })}>
                    <SelectTrigger aria-label="单位" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METRIC_UNITS.map((unit) => <SelectItem key={unit} value={unit}>{UNIT_LABELS[unit]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="小数位">
                  <Input aria-label="小数位" type="number" min={0} max={6} value={form.precision} onChange={(event) => setForm({ ...form, precision: Number(event.target.value) })} />
                </Field>
              </div>

              <Field label="匹配别名">
                <Input aria-label="匹配别名" value={aliasText} onChange={(event) => setAliasText(event.target.value)} placeholder="如：连带率、搭售率" />
              </Field>

              <Field label="计算口径">
                <Textarea aria-label="计算口径" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-28 resize-y" />
              </Field>

              <div>
                <Label className="mb-3">数据表</Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                  {METRIC_SOURCE_TABLES.map((table) => {
                    const selected = form.requestedTables.includes(table);
                    return (
                      <label key={table} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-xs hover:bg-zinc-50">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) =>
                            setForm({
                              ...form,
                              requestedTables: checked
                                ? [...form.requestedTables, table]
                                : form.requestedTables.filter((item) => item !== table),
                            })
                          }
                        />
                        <span className="min-w-0 truncate">{SOURCE_TABLE_LABELS[table]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex min-h-[620px] min-w-0 flex-col lg:min-h-0">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Database className="size-4" />
                  计算 Query
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => void handleGenerateSql()} disabled={Boolean(busyAction)}>
                    {busyAction === "generate" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    AI 生成
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void handleValidate()} disabled={!form.sqlTemplate || Boolean(busyAction)}>
                    <ShieldCheck />校验
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void handleTest()} disabled={!form.sqlTemplate || Boolean(busyAction)}>
                    {busyAction === "test" ? <Loader2 className="animate-spin" /> : <Play />}
                    试运行
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <Textarea
                  aria-label="计算 Query"
                  value={form.sqlTemplate}
                  onChange={(event) => {
                    setForm({ ...form, sqlTemplate: event.target.value });
                    setValidation(null);
                    setTestResult(null);
                  }}
                  spellCheck={false}
                  placeholder="SELECT ... AS metric_value FROM ..."
                  className="min-h-80 resize-y bg-zinc-950 font-mono text-xs leading-6 text-zinc-100 placeholder:text-zinc-600 lg:min-h-[380px]"
                />

                {authoringNote && (
                  <div className="border-l-2 border-[#FFE600] bg-yellow-50 px-3 py-2 text-xs leading-5 text-zinc-600">
                    {authoringNote}
                  </div>
                )}

                {validation && <ValidationPanel validation={validation} />}
                {testResult && <TestResultTable result={testResult} />}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-zinc-200 px-5 py-3">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>关闭</Button>
            <Button variant="outline" onClick={() => void handleSave()} disabled={Boolean(busyAction)}>
              {busyAction === "save" ? <Loader2 className="animate-spin" /> : <Save />}
              保存草稿
            </Button>
            <Button onClick={() => void handlePublish()} disabled={!form.sqlTemplate || Boolean(busyAction)} className="bg-[#18181b] text-white hover:bg-zinc-800">
              {busyAction === "publish" ? <Loader2 className="animate-spin" /> : <Rocket />}
              发布指标
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除自定义指标</AlertDialogTitle>
            <AlertDialogDescription>
              删除后业务 Agent 将无法再调用“{deleteTarget?.name}”。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} className="bg-red-600 text-white hover:bg-red-700">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SummaryItem({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "success" | "warning" }) {
  const color = tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-zinc-950";
  return (
    <div className="border-b border-r border-zinc-200 px-4 py-3 last:border-r-0 sm:border-b-0">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: RegisteredMetricDefinition["status"] }) {
  const config = {
    system: ["系统内置", "border-zinc-300 bg-zinc-100 text-zinc-700"],
    draft: ["草稿", "border-amber-200 bg-amber-50 text-amber-700"],
    validated: ["已校验", "border-blue-200 bg-blue-50 text-blue-700"],
    published: ["已发布", "border-emerald-200 bg-emerald-50 text-emerald-700"],
    disabled: ["已停用", "border-zinc-300 bg-white text-zinc-500"],
  }[status];
  return <Badge variant="outline" className={`rounded-md font-normal ${config[1]}`}>{config[0]}</Badge>;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-2">{label}</Label>
      {children}
    </div>
  );
}

function ValidationPanel({ validation }: { validation: MetricSqlValidation }) {
  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${validation.valid ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
      <div className="flex items-center gap-2 font-medium">
        {validation.valid ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
        {validation.valid ? "SQL 校验通过" : "SQL 校验失败"}
      </div>
      {validation.errors.map((error) => <div key={error} className="mt-1 pl-6">{error}</div>)}
      {validation.valid && (
        <div className="mt-1 pl-6 text-emerald-700">
          {validation.tables.join("、")} · {validation.outputColumns.join("、")}
        </div>
      )}
    </div>
  );
}

function TestResultTable({ result }: { result: MetricQueryResult }) {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
        <span className="font-medium text-zinc-700">试运行结果</span>
        <span className="text-zinc-400">{result.rowCount} 行</span>
      </div>
      <Table>
        <TableHeader><TableRow>{result.columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {result.rows.slice(0, 10).map((row, index) => (
            <TableRow key={index}>{result.columns.map((column) => <TableCell key={column}>{String(row[column] ?? "-")}</TableCell>)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function createEmptyMetric(): MetricDefinitionInput {
  return {
    code: "",
    name: "",
    description: "",
    aliases: [],
    category: "sales",
    unit: "number",
    precision: 2,
    requestedTables: ["store_sales_daily"],
    sqlTemplate: "",
  };
}

async function adminRequest<T = Record<string, unknown>>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/admin/metrics", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401) {
    window.location.replace("/login?next=/admin");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) throw new Error(payload.error || "管理后台请求失败。");
  return payload;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请重试。";
}
