export function formatReportNumber(
  value: number,
  options?: { pct?: boolean; currency?: boolean; dec?: number }
): string {
  const { pct = false, currency = false, dec = 0 } = options || {};
  if (pct) return `${(value * 100).toFixed(dec)}%`;
  if (currency) {
    return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  }
  return value.toFixed(dec);
}

export function formatReportDateLabel(date: string): string {
  return date.slice(5).replace("-", "月");
}
