export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

export function sumBy<TItem>(
  items: TItem[],
  getValue: (item: TItem) => number
): number {
  return items.reduce((sum, item) => sum + getValue(item), 0);
}

export function aggregateByKey<TItem>(
  items: TItem[],
  getKey: (item: TItem) => string,
  getValue: (item: TItem) => number
): Record<string, number> {
  return items.reduce<Record<string, number>>((totals, item) => {
    const key = getKey(item);
    totals[key] = (totals[key] || 0) + getValue(item);
    return totals;
  }, {});
}
