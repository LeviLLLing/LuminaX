"use client";

import { BarChart3, ChevronDown, Store, StoreIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StoreMaster } from "@/modules/domain/sales-data";
import { getMetricLabel } from "@/modules/workbench/workbench-presentation";

interface ScopeBarProps {
  stores: StoreMaster[];
  availableMetricCodes: string[];
  selectedStore: string;
  compareStores: string[];
  startDate: string;
  endDate: string;
  onSelectedStoreChange(value: string): void;
  onCompareStoresChange(value: string[]): void;
  onStartDateChange(value: string): void;
  onEndDateChange(value: string): void;
}

export function ScopeBar({
  stores,
  availableMetricCodes,
  selectedStore,
  compareStores,
  startDate,
  endDate,
  onSelectedStoreChange,
  onCompareStoresChange,
  onStartDateChange,
  onEndDateChange,
}: ScopeBarProps) {
  const authorizedStoreIds = new Set(stores.map((store) => store.store_id));
  const selectedStoreValue = authorizedStoreIds.has(selectedStore)
    ? selectedStore
    : "";
  const selectedComparisonIds = compareStores.filter((storeId) =>
    authorizedStoreIds.has(storeId)
  );
  const comparisonDisabled = stores.length < 2;

  function selectPrimaryStore(value: string) {
    if (!authorizedStoreIds.has(value)) return;
    onSelectedStoreChange(value);
    onCompareStoresChange([]);
  }

  function updateComparison(storeId: string, checked: boolean) {
    if (!authorizedStoreIds.has(storeId)) return;

    const nextStoreIds = new Set(selectedComparisonIds);
    if (checked) {
      nextStoreIds.add(storeId);
    } else {
      nextStoreIds.delete(storeId);
    }

    onCompareStoresChange(
      stores
        .map((store) => store.store_id)
        .filter((authorizedStoreId) => nextStoreIds.has(authorizedStoreId))
    );
  }

  return (
    <div className="flex shrink-0 flex-wrap items-end gap-x-3 gap-y-2 border-b border-[#dedfe2] bg-white px-3 py-2 sm:px-4">
      <label className="flex min-w-0 flex-1 basis-44 flex-col gap-1 text-xs font-medium text-[#4b4e55]">
        门店
        <span className="relative">
          <Store className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-[#4b4e55]" />
          <select
            value={selectedStoreValue}
            onChange={(event) => selectPrimaryStore(event.target.value)}
            disabled={stores.length === 0}
            className="h-9 w-full min-w-0 appearance-none rounded-md border border-[#737780] bg-white py-1 pr-8 pl-8 text-sm text-black outline-none transition-colors hover:border-black focus:border-black focus:ring-2 focus:ring-black/20 disabled:cursor-not-allowed disabled:bg-[#f5f6f7] disabled:text-[#737780]"
          >
            <option value="" disabled>
              {stores.length === 0
                ? "暂无可用门店"
                : selectedStore === "all"
                  ? "全部授权门店"
                  : "选择门店"}
            </option>
            {stores.map((store) => (
              <option key={store.store_id} value={store.store_id}>
                {store.store_name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-[#4b4e55]" />
        </span>
      </label>

      <label className="flex min-w-[8.5rem] flex-1 basis-36 flex-col gap-1 text-xs font-medium text-[#4b4e55]">
        开始日期
        <input
          type="date"
          value={startDate}
          onChange={(event) => onStartDateChange(event.target.value)}
          className="h-9 w-full rounded-md border border-[#737780] bg-white px-2 text-sm text-black outline-none transition-colors hover:border-black focus:border-black focus:ring-2 focus:ring-black/20"
        />
      </label>

      <label className="flex min-w-[8.5rem] flex-1 basis-36 flex-col gap-1 text-xs font-medium text-[#4b4e55]">
        结束日期
        <input
          type="date"
          value={endDate}
          onChange={(event) => onEndDateChange(event.target.value)}
          className="h-9 w-full rounded-md border border-[#737780] bg-white px-2 text-sm text-black outline-none transition-colors hover:border-black focus:border-black focus:ring-2 focus:ring-black/20"
        />
      </label>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={comparisonDisabled}
            className="flex h-9 min-w-0 max-w-full items-center gap-2 rounded-md border border-[#737780] bg-white px-3 text-sm font-medium text-black transition-colors hover:border-black hover:bg-[#f5f6f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:cursor-not-allowed disabled:bg-[#f5f6f7] disabled:text-[#737780]"
          >
            <StoreIcon className="size-4 shrink-0" />
            <span className="truncate">
              对比门店{selectedComparisonIds.length > 0 ? ` (${selectedComparisonIds.length})` : ""}
            </span>
            <ChevronDown className="size-4 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-md border-[#737780]">
          <DropdownMenuLabel>选择对比门店</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {stores.map((store) => (
            <DropdownMenuCheckboxItem
              key={store.store_id}
              checked={selectedComparisonIds.includes(store.store_id)}
              onCheckedChange={(checked) =>
                updateComparison(store.store_id, checked)
              }
            >
              {store.store_name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 min-w-0 max-w-full items-center gap-2 rounded-md border border-[#737780] bg-white px-3 text-sm font-medium text-black transition-colors hover:border-black hover:bg-[#f5f6f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
          >
            <BarChart3 className="size-4 shrink-0" />
            <span className="truncate">可用指标</span>
            <ChevronDown className="size-4 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-md border-[#737780]">
          <DropdownMenuLabel>可用指标</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableMetricCodes.length > 0 ? (
            availableMetricCodes.map((metricCode) => (
              <DropdownMenuItem
                key={metricCode}
                onSelect={(event) => event.preventDefault()}
              >
                {getMetricLabel(metricCode)}
              </DropdownMenuItem>
            ))
          ) : (
            <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
              暂无可用指标
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
