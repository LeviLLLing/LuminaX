"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Columns3,
  Database,
  Edit3,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserRound,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  AccessDecision,
  PermissionUser,
  PermissionUserInput,
  TableAccessPolicy,
} from "@/modules/admin/permissions/permission-types";

interface DataTableOption {
  name: string;
  label: string;
  columns: string[];
}

interface StoreOption {
  id: string;
  name: string;
}

interface PermissionUserView extends PermissionUser {
  credentialConfigured: boolean;
}

interface PermissionSnapshot {
  users: PermissionUserView[];
  catalog: DataTableOption[];
  stores: StoreOption[];
}

interface UserEditorForm extends PermissionUserInput {
  password: string;
}

const ROLE_LABELS = {
  super_admin: "系统管理员",
  manager: "业务经理",
  analyst: "数据分析师",
} as const;

export function PermissionManagementPanel() {
  const [snapshot, setSnapshot] = useState<PermissionSnapshot>({
    users: [],
    catalog: [],
    stores: [],
  });
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<UserEditorForm>(createEmptyUser());
  const [selectedTable, setSelectedTable] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PermissionUser | null>(null);
  const [simulation, setSimulation] = useState({
    userId: "",
    tableName: "",
    columnName: "",
    storeId: "",
  });
  const [decision, setDecision] = useState<AccessDecision | null>(null);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await permissionRequest<PermissionSnapshot>();
      setSnapshot(payload);
      setSimulation((current) => {
        const tableName = current.tableName || payload.catalog[0]?.name || "";
        const table = payload.catalog.find((item) => item.name === tableName);
        return {
          userId: current.userId || payload.users[0]?.id || "",
          tableName,
          columnName: table?.columns.includes(current.columnName)
            ? current.columnName
            : table?.columns[0] || "",
          storeId: current.storeId || payload.stores[0]?.id || "",
        };
      });
    } catch (error) {
      toast.error(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return snapshot.users;
    return snapshot.users.filter((user) =>
      [user.username, user.displayName, ROLE_LABELS[user.role]]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [search, snapshot.users]);

  const selectedCatalogTable = snapshot.catalog.find(
    (table) => table.name === selectedTable
  );
  const selectedPolicy = form.policies.find(
    (policy) => policy.tableName === selectedTable
  );
  const activeUsers = snapshot.users.filter(
    (user) => user.status === "active"
  ).length;
  const restrictedUsers = snapshot.users.filter(
    (user) => !user.system
  ).length;

  function openCreate() {
    setForm(createEmptyUser());
    setSelectedTable(snapshot.catalog[0]?.name || "");
    setEditorOpen(true);
  }

  function openEdit(user: PermissionUser) {
    if (user.system) return;
    setForm({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role === "manager" ? "manager" : "analyst",
      status: user.status,
      policies: structuredClone(user.policies),
      password: "",
    });
    setSelectedTable(
      user.policies[0]?.tableName || snapshot.catalog[0]?.name || ""
    );
    setEditorOpen(true);
  }

  function toggleTable(tableName: string, enabled: boolean) {
    setSelectedTable(tableName);
    setForm((current) => {
      const exists = current.policies.some(
        (policy) => policy.tableName === tableName
      );
      if (enabled && !exists) {
        const table = snapshot.catalog.find((item) => item.name === tableName);
        const defaultColumns = (table?.columns || []).filter((column) =>
          ["store_id", "date"].includes(column)
        );
        return {
          ...current,
          policies: [
            ...current.policies,
            {
              tableName,
              allowedColumns: defaultColumns,
              allowedStoreIds: [],
            },
          ],
        };
      }
      if (!enabled && exists) {
        return {
          ...current,
          policies: current.policies.filter(
            (policy) => policy.tableName !== tableName
          ),
        };
      }
      return current;
    });
  }

  function updatePolicy(
    tableName: string,
    updater: (policy: TableAccessPolicy) => TableAccessPolicy
  ) {
    setForm((current) => ({
      ...current,
      policies: current.policies.map((policy) =>
        policy.tableName === tableName ? updater(policy) : policy
      ),
    }));
  }

  function togglePolicyValue(
    field: "allowedColumns" | "allowedStoreIds",
    value: string,
    checked: boolean
  ) {
    if (!selectedPolicy) return;
    updatePolicy(selectedPolicy.tableName, (policy) => ({
      ...policy,
      [field]: checked
        ? [...new Set([...policy[field], value])]
        : policy[field].filter((item) => item !== value),
    }));
  }

  function setAllPolicyValues(
    field: "allowedColumns" | "allowedStoreIds",
    values: string[]
  ) {
    if (!selectedPolicy) return;
    updatePolicy(selectedPolicy.tableName, (policy) => ({
      ...policy,
      [field]: policy[field].length === values.length ? [] : [...values],
    }));
  }

  async function saveUser() {
    await withBusy("save", async () => {
      await permissionRequest({ action: "saveUser", user: form });
      setEditorOpen(false);
      await loadPermissions();
      toast.success(form.id ? "用户权限已更新" : "用户已创建");
    });
  }

  async function toggleStatus(user: PermissionUser, active: boolean) {
    await withBusy(`status:${user.id}`, async () => {
      await permissionRequest({
        action: "setStatus",
        id: user.id,
        status: active ? "active" : "disabled",
      });
      await loadPermissions();
      toast.success(active ? "用户已启用" : "用户已停用");
    });
  }

  async function removeUser() {
    if (!deleteTarget) return;
    await withBusy(`remove:${deleteTarget.id}`, async () => {
      await permissionRequest({ action: "remove", id: deleteTarget.id });
      setDeleteTarget(null);
      await loadPermissions();
      toast.success("用户已删除");
    });
  }

  async function evaluatePermission() {
    await withBusy("evaluate", async () => {
      const payload = await permissionRequest<{ decision: AccessDecision }>({
        action: "evaluate",
        ...simulation,
      });
      setDecision(payload.decision);
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

  function changeSimulationTable(tableName: string) {
    const table = snapshot.catalog.find((item) => item.name === tableName);
    setSimulation((current) => ({
      ...current,
      tableName,
      columnName: table?.columns[0] || "",
    }));
    setDecision(null);
  }

  return (
    <section className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-xl font-semibold text-zinc-950">权限管理</h1>
            <p className="mt-1 text-sm text-zinc-500">用户级数据访问策略</p>
          </div>
          <Button
            onClick={openCreate}
            className="bg-[#18181b] text-white hover:bg-zinc-800"
          >
            <Plus className="size-4" />
            新增用户
          </Button>
        </div>

        <div className="mb-5 grid grid-cols-2 border border-zinc-200 bg-white sm:grid-cols-4">
          <SummaryItem label="全部用户" value={snapshot.users.length} />
          <SummaryItem label="启用中" value={activeUsers} tone="success" />
          <SummaryItem label="受限用户" value={restrictedUsers} />
          <SummaryItem label="数据表" value={snapshot.catalog.length} />
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索用户名、姓名或角色"
                className="pl-9"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void loadPermissions()}
                  disabled={loading}
                >
                  <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                  <span className="sr-only">刷新</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>刷新用户</TooltipContent>
            </Tooltip>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-50 hover:bg-zinc-50">
                <TableHead className="min-w-52 pl-4">用户</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>数据表</TableHead>
                <TableHead>字段授权</TableHead>
                <TableHead>门店范围</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="pr-4 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-44 text-center">
                    <Loader2 className="mx-auto size-5 animate-spin text-zinc-400" />
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-44 text-center text-sm text-zinc-500">
                    没有符合条件的用户
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => {
                  const columnCount = new Set(
                    user.policies.flatMap((policy) =>
                      policy.allowedColumns.map(
                        (column) => `${policy.tableName}.${column}`
                      )
                    )
                  ).size;
                  const storeCount = user.system
                    ? snapshot.stores.length
                    : new Set(
                        user.policies.flatMap((policy) => policy.allowedStoreIds)
                      ).size;
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500">
                            <UserRound className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-zinc-900">
                              <span>{user.displayName}</span>
                              {!user.credentialConfigured && (
                                <Badge
                                  variant="outline"
                                  className="ml-2 rounded-md border-amber-300 bg-amber-50 px-1.5 py-0 text-[10px] font-normal text-amber-700"
                                >
                                  未设密码
                                </Badge>
                              )}
                            </div>
                            <div className="truncate font-mono text-xs text-zinc-400">
                              {user.username}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-md font-normal">
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.system ? "全部" : user.policies.length}</TableCell>
                      <TableCell>{user.system ? "全部" : columnCount}</TableCell>
                      <TableCell>{user.system ? "全部" : `${storeCount} 家`}</TableCell>
                      <TableCell>
                        <Switch
                          checked={user.status === "active"}
                          disabled={user.system || busyAction === `status:${user.id}`}
                          onCheckedChange={(checked) =>
                            void toggleStatus(user, checked)
                          }
                          aria-label={`${user.displayName}启用状态`}
                        />
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        {!user.system && (
                          <div className="flex justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => openEdit(user)}
                                >
                                  <Edit3 className="size-4" />
                                  <span className="sr-only">编辑</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>编辑用户权限</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => setDeleteTarget(user)}
                                >
                                  <Trash2 className="size-4" />
                                  <span className="sr-only">删除</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>删除用户</TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
            <ShieldCheck className="size-4 text-zinc-600" />
            <h2 className="text-sm font-semibold text-zinc-900">权限模拟器</h2>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[1.1fr_1.2fr_1.2fr_1.1fr_auto] xl:items-end">
            <Select
              value={simulation.userId}
              onValueChange={(userId) => {
                setSimulation((current) => ({ ...current, userId }));
                setDecision(null);
              }}
            >
              <LabeledSelect label="用户" placeholder="选择用户">
                {snapshot.users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.displayName} ({user.username})
                  </SelectItem>
                ))}
              </LabeledSelect>
            </Select>
            <Select value={simulation.tableName} onValueChange={changeSimulationTable}>
              <LabeledSelect label="数据表" placeholder="选择数据表">
                {snapshot.catalog.map((table) => (
                  <SelectItem key={table.name} value={table.name}>
                    {table.label}
                  </SelectItem>
                ))}
              </LabeledSelect>
            </Select>
            <Select
              value={simulation.columnName}
              onValueChange={(columnName) => {
                setSimulation((current) => ({ ...current, columnName }));
                setDecision(null);
              }}
            >
              <LabeledSelect label="字段" placeholder="选择字段">
                {(snapshot.catalog.find(
                  (table) => table.name === simulation.tableName
                )?.columns || []).map((column) => (
                  <SelectItem key={column} value={column}>
                    {column}
                  </SelectItem>
                ))}
              </LabeledSelect>
            </Select>
            <Select
              value={simulation.storeId}
              onValueChange={(storeId) => {
                setSimulation((current) => ({ ...current, storeId }));
                setDecision(null);
              }}
            >
              <LabeledSelect label="门店值" placeholder="选择门店">
                {snapshot.stores.map((store) => (
                  <SelectItem key={store.id} value={store.id}>
                    {store.id} · {store.name}
                  </SelectItem>
                ))}
              </LabeledSelect>
            </Select>
            <Button
              variant="outline"
              onClick={() => void evaluatePermission()}
              disabled={busyAction === "evaluate" || !simulation.userId}
            >
              {busyAction === "evaluate" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              验证
            </Button>
          </div>
          {decision && (
            <div
              className={`flex items-center gap-2 border-t px-4 py-3 text-sm ${
                decision.allowed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              {decision.allowed ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <ShieldX className="size-4 shrink-0" />
              )}
              {decision.reason}
            </div>
          )}
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "编辑用户权限" : "新增用户"}</DialogTitle>
            <DialogDescription>配置数据表、字段与门店数据范围</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto pr-1 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="permission-username">用户名</Label>
                <Input
                  id="permission-username"
                  value={form.username}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                  placeholder="例如 sherry"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="permission-display-name">显示名称</Label>
                <Input
                  id="permission-display-name"
                  value={form.displayName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  placeholder="例如 Sherry"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="permission-password">
                  {form.id ? "重置登录密码" : "登录密码"}
                </Label>
                <Input
                  id="permission-password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  placeholder={form.id ? "留空则保持不变" : "至少 6 个字符"}
                />
              </div>
              <div className="space-y-2">
                <Label>角色</Label>
                <Select
                  value={form.role}
                  onValueChange={(role) =>
                    setForm((current) => ({
                      ...current,
                      role: role as PermissionUserInput["role"],
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">业务经理</SelectItem>
                    <SelectItem value="analyst">数据分析师</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between border-y border-zinc-200 py-3">
                <Label htmlFor="permission-active">启用用户</Label>
                <Switch
                  id="permission-active"
                  checked={form.status === "active"}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      status: checked ? "active" : "disabled",
                    }))
                  }
                />
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-md border border-zinc-200">
              <div className="grid min-h-[430px] md:grid-cols-[240px_minmax(0,1fr)]">
                <div className="border-b border-zinc-200 bg-zinc-50 md:border-b-0 md:border-r">
                  <div className="flex h-11 items-center gap-2 border-b border-zinc-200 px-3 text-xs font-semibold text-zinc-600">
                    <Database className="size-4" />
                    数据表
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1.5 md:max-h-[390px]">
                    {snapshot.catalog.map((table) => {
                      const granted = form.policies.some(
                        (policy) => policy.tableName === table.name
                      );
                      return (
                        <div
                          key={table.name}
                          className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${
                            selectedTable === table.name
                              ? "bg-white text-zinc-950 shadow-sm"
                              : "text-zinc-600 hover:bg-white/70"
                          }`}
                        >
                          <Checkbox
                            checked={granted}
                            onCheckedChange={(checked) =>
                              toggleTable(table.name, Boolean(checked))
                            }
                            aria-label={`授权 ${table.label}`}
                          />
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left"
                            onClick={() => setSelectedTable(table.name)}
                          >
                            {table.label}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="min-w-0 p-4">
                  {selectedCatalogTable && selectedPolicy ? (
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-zinc-900">
                              {selectedCatalogTable.label}
                            </h3>
                            <p className="truncate font-mono text-xs text-zinc-400">
                              {selectedCatalogTable.name}
                            </p>
                          </div>
                          <Badge variant="outline" className="rounded-md font-normal">
                            已授权
                          </Badge>
                        </div>
                      </div>

                      <PolicySection
                        icon={Columns3}
                        title="字段权限"
                        selected={selectedPolicy.allowedColumns.length}
                        total={selectedCatalogTable.columns.length}
                        onToggleAll={() =>
                          setAllPolicyValues(
                            "allowedColumns",
                            selectedCatalogTable.columns
                          )
                        }
                      >
                        {selectedCatalogTable.columns.map((column) => (
                          <PolicyCheckbox
                            key={column}
                            label={column}
                            checked={selectedPolicy.allowedColumns.includes(column)}
                            onCheckedChange={(checked) =>
                              togglePolicyValue(
                                "allowedColumns",
                                column,
                                checked
                              )
                            }
                          />
                        ))}
                      </PolicySection>

                      <PolicySection
                        icon={Building2}
                        title="门店字段值"
                        selected={selectedPolicy.allowedStoreIds.length}
                        total={snapshot.stores.length}
                        onToggleAll={() =>
                          setAllPolicyValues(
                            "allowedStoreIds",
                            snapshot.stores.map((store) => store.id)
                          )
                        }
                      >
                        {snapshot.stores.map((store) => (
                          <PolicyCheckbox
                            key={store.id}
                            label={`${store.id} · ${store.name}`}
                            checked={selectedPolicy.allowedStoreIds.includes(store.id)}
                            onCheckedChange={(checked) =>
                              togglePolicyValue(
                                "allowedStoreIds",
                                store.id,
                                checked
                              )
                            }
                          />
                        ))}
                      </PolicySection>
                    </div>
                  ) : (
                    <div className="grid h-full min-h-60 place-items-center text-center">
                      <div>
                        <ShieldX className="mx-auto size-7 text-zinc-300" />
                        <p className="mt-2 text-sm font-medium text-zinc-700">
                          未授权此数据表
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => void saveUser()}
              disabled={busyAction === "save"}
              className="bg-[#18181b] text-white hover:bg-zinc-800"
            >
              {busyAction === "save" && <Loader2 className="size-4 animate-spin" />}
              保存权限
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除用户</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，该用户将立即失去所有 LuminaX 数据访问权限。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void removeUser()}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SummaryItem({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success";
}) {
  return (
    <div className="border-b border-r border-zinc-200 px-4 py-3 last:border-r-0 sm:border-b-0">
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold ${
          tone === "success" ? "text-emerald-700" : "text-zinc-950"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function LabeledSelect({
  label,
  placeholder,
  children,
}: {
  label: string;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-zinc-500">{label}</Label>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </div>
  );
}

function PolicySection({
  icon: Icon,
  title,
  selected,
  total,
  onToggleAll,
  children,
}: {
  icon: typeof Database;
  title: string;
  selected: number;
  total: number;
  onToggleAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-800">
          <Icon className="size-4 text-zinc-500" />
          {title}
          <span className="text-xs font-normal text-zinc-400">
            {selected}/{total}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onToggleAll}>
          {selected === total ? "清空" : "全选"}
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  );
}

function PolicyCheckbox({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-9 min-w-0 items-center gap-2 rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(Boolean(value))}
      />
      <span className="min-w-0 break-all">{label}</span>
    </label>
  );
}

function createEmptyUser(): UserEditorForm {
  return {
    username: "",
    displayName: "",
    role: "analyst",
    status: "active",
    policies: [],
    password: "",
  };
}

async function permissionRequest<T = Record<string, unknown>>(
  body?: Record<string, unknown>
): Promise<T> {
  const response = await fetch("/api/admin/permissions", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (response.status === 401) {
    window.location.replace("/login?next=/admin");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) throw new Error(payload.error || "权限管理请求失败。");
  return payload;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "权限管理操作失败。";
}
