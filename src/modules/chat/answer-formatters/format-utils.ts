export function money(value: number): string {
  return `¥${num(Math.round(value))}`;
}

export function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function num(value: number): string {
  return value.toLocaleString("zh-CN");
}
