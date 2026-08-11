export function formatAnomalyDetection(data: Record<string, unknown>): string {
  const stores = data.stores as Array<{
    storeId: string;
    storeName: string;
    anomalyCount: number;
    anomalyDays: Array<{ date: string; reasons: string[] }>;
  }>;

  const lines = [
    "异常检测已完成，以下日期建议优先复盘。",
    "",
    "| 门店 | 异常日期 | 异常原因 |",
    "|---|---|---|",
  ];

  for (const store of stores) {
    if (store.anomalyCount === 0) {
      lines.push(`| ${store.storeName}（${store.storeId}） | - | 未检测到明显异常 |`);
      continue;
    }
    for (const day of store.anomalyDays) {
      lines.push(
        `| ${store.storeName}（${store.storeId}） | ${day.date} | ${day.reasons.join("；")} |`
      );
    }
  }

  return lines.join("\n");
}
