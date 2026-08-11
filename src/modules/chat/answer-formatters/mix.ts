import { money, num, pct } from "@/modules/chat/answer-formatters/format-utils";

export function formatChannelMix(data: Record<string, unknown>): string {
  const channels = data.channelPct as Array<{
    channel: string;
    sales: number;
    orders: number;
    salesPct: number;
  }>;

  return [
    "渠道销售占比已完成计算，销售贡献最高的渠道应优先关注履约和转化效率。",
    "",
    "| 渠道 | 销售额 | 订单量 | 销售占比 |",
    "|---|---:|---:|---:|",
    ...channels.map(
      (channel) =>
        `| ${channel.channel} | ${money(channel.sales)} | ${num(channel.orders)} | ${pct(channel.salesPct)} |`
    ),
  ].join("\n");
}

export function formatDaypartAnalysis(data: Record<string, unknown>): string {
  const dayparts = data.daypartPct as Array<{
    daypart: string;
    sales: number;
    orders: number;
    avgOrderValue: number;
    salesPct: number;
  }>;

  return [
    "分时段表现已完成计算，可以据此判断主要销售贡献集中在哪些时段。",
    "",
    "| 时段 | 销售额 | 订单量 | 客单价 | 销售占比 |",
    "|---|---:|---:|---:|---:|",
    ...dayparts.map(
      (daypart) =>
        `| ${daypart.daypart} | ${money(daypart.sales)} | ${num(daypart.orders)} | ${money(daypart.avgOrderValue)} | ${pct(daypart.salesPct)} |`
    ),
  ].join("\n");
}
