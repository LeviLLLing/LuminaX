# -*- coding: utf-8 -*-
"""
KFC 区域经理周报生成器
输出单份 HTML 报表：区域经理周报
特性：集成 ECharts 交互式图表、趋势分析、智能文字总结
"""
import pandas as pd
import numpy as np
import os
import json
from datetime import datetime

# ==================== 配置 ====================
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(SCRIPT_DIR, 'KFC_Store_Sales_PoC_Sample_Data.xlsx')
OUTPUT_DIR = SCRIPT_DIR
# ==============================================

EY_CSS = """
<style>
body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 0; background: #f4f6f9; color: #1a1a1a; line-height: 1.6; }
.container { max-width: 1280px; margin: 20px auto; background: #fff; box-shadow: 0 6px 30px rgba(0,0,0,0.10); border-radius: 8px; overflow: hidden; }
.header { background: #1a1a1a; color: #FFE600; padding: 28px 36px; border-bottom: 5px solid #FFE600; }
.header h1 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 1px; }
.meta { color: #bbb; font-size: 12px; margin-top: 8px; font-weight: 500; }
.content { padding: 28px 36px 36px; }
.section { margin-bottom: 28px; }
.section h2 { color: #1a1a1a; border-bottom: 3px solid #FFE600; padding-bottom: 8px; font-size: 17px; font-weight: 700; margin-top: 0; display: flex; align-items: center; gap: 8px; }
.section h3 { color: #1a1a1a; font-size: 14px; font-weight: 700; margin-top: 18px; margin-bottom: 8px; border-left: 4px solid #FFE600; padding-left: 8px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 16px 0; }
.kpi-card { background: #fff; border-radius: 8px; padding: 18px; border: 1px solid #e8e8e8; border-top: 4px solid #FFE600; box-shadow: 0 2px 8px rgba(0,0,0,0.04); transition: transform 0.2s; }
.kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.kpi-value { font-size: 24px; font-weight: 700; color: #1a1a1a; }
.kpi-label { font-size: 11px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-delta { font-size: 12px; margin-top: 6px; font-weight: 600; }
.pos { color: #2e7d32; }
.neg { color: #c62828; }
.neu { color: #757575; }
.summary-box { background: #fffbe6; border-left: 4px solid #FFE600; padding: 14px 18px; margin: 12px 0; border-radius: 0 6px 6px 0; font-size: 13px; line-height: 1.8; }
.alert-box { background: #ffebee; border-left: 4px solid #c62828; padding: 12px 16px; margin: 8px 0; border-radius: 0 6px 6px 0; font-size: 13px; }
.good-box { background: #e8f5e9; border-left: 4px solid #2e7d32; padding: 12px 16px; margin: 8px 0; border-radius: 0 6px 6px 0; font-size: 13px; }
.info-box { background: #e3f2fd; border-left: 4px solid #1565c0; padding: 12px 16px; margin: 8px 0; border-radius: 0 6px 6px 0; font-size: 13px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; background: #fff; }
th { background: #1a1a1a; color: #FFE600; padding: 10px 12px; text-align: left; font-weight: 600; }
td { padding: 8px 12px; border-bottom: 1px solid #e8e8e8; }
tr:nth-child(even) { background: #fafafa; }
.rank-1 { background: #fff8e1 !important; }
.rank-last { background: #ffebee !important; }
.bar-chart { display: flex; align-items: center; margin: 4px 0; font-size: 12px; }
.bar-label { width: 100px; text-align: right; padding-right: 8px; color: #555; }
.bar-track { flex: 1; background: #eee; border-radius: 4px; height: 16px; position: relative; }
.bar-fill { background: #FFE600; height: 100%; border-radius: 4px; }
.bar-value { margin-left: 8px; font-weight: 600; }
.chart-container { width: 100%; height: 320px; background: #fff; border-radius: 6px; margin: 12px 0; }
.chart-row { display: flex; gap: 20px; flex-wrap: wrap; }
.chart-col { flex: 1; min-width: 380px; }
.chart-title { font-size: 13px; font-weight: 600; color: #444; margin-bottom: 6px; padding-left: 4px; }
.footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #e0e0e0; font-size: 10px; color: #999; text-align: center; }
.tip { color: #666; font-size: 11px; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 6px; }
.tag-up { background: #e8f5e9; color: #2e7d32; }
.tag-down { background: #ffebee; color: #c62828; }
.tag-warn { background: #fff3e0; color: #e65100; }
</style>
"""

ECHARTS_CDN = '<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>'

BRAND_COLORS = ['#FFE600', '#1a1a1a', '#c62828', '#2e7d32', '#1565c0', '#f57c00', '#7b1fa2', '#00796b']


def _chart_script(chart_id, option):
    """生成 ECharts 初始化脚本"""
    return f"""
    <script>
    (function() {{
        var chartDom = document.getElementById('{chart_id}');
        if (!chartDom) return;
        var myChart = echarts.init(chartDom);
        var option = {json.dumps(option, ensure_ascii=False, default=str)};
        myChart.setOption(option);
        window.addEventListener('resize', function() {{ myChart.resize(); }});
    }})();
    </script>
    """


def _base_option(title, series_list, x_axis_data, y_axis_name='', legend=True):
    """构建通用 ECharts option"""
    opt = {
        "tooltip": {"trigger": "axis", "axisPointer": {"type": "cross"}, "textStyle": {"fontSize": 11}},
        "legend": {"show": legend, "bottom": 0, "textStyle": {"fontSize": 11}},
        "grid": {"left": "3%", "right": "4%", "bottom": "15%", "top": "15%", "containLabel": True},
        "xAxis": {"type": "category", "data": x_axis_data, "axisLabel": {"fontSize": 11, "rotate": 30}},
        "yAxis": {"type": "value", "name": y_axis_name, "axisLabel": {"fontSize": 11}},
        "series": series_list,
        "title": {"text": title, "left": "center", "textStyle": {"fontSize": 14, "fontWeight": "bold", "color": "#1a1a1a"}}
    }
    return opt


def read_data():
    """读取所有数据表"""
    dfs = {}
    sheets = [
        'store_master', 'sales_target_daily', 'store_sales_daily',
        'sales_by_channel', 'sales_by_daypart', 'sales_by_category',
        'promotion_daily', 'refund_cancel_daily', 'store_manager_feedback',
        'store_sales_attribution_dataset'
    ]
    for s in sheets:
        dfs[s] = pd.read_excel(INPUT_FILE, sheet_name=s)
    return dfs


def compute_metrics(dfs):
    """计算核心指标及图表数据"""
    m = {}
    sd = dfs['store_sales_daily']
    st = dfs['sales_target_daily']
    ch = dfs['sales_by_channel']
    dp = dfs['sales_by_daypart']
    ca = dfs['sales_by_category']
    pr = dfs['promotion_daily']
    rf = dfs['refund_cancel_daily']
    at = dfs['store_sales_attribution_dataset']

    # 整体指标
    m['total_sales'] = sd['actual_sales'].sum()
    m['total_target'] = st['sales_target'].sum()
    m['achievement_rate'] = m['total_sales'] / m['total_target']
    m['total_orders'] = sd['order_count'].sum()
    m['total_customers'] = sd['customer_count'].sum()
    m['avg_aov'] = sd['avg_order_value'].mean()
    m['total_refund'] = sd['refund_amount'].sum()
    m['refund_rate'] = m['total_refund'] / m['total_sales']
    m['total_cancel'] = sd['cancelled_orders'].sum()

    # 门店汇总
    store_sum = sd.groupby('store_id').agg({
        'actual_sales': 'sum',
        'order_count': 'sum',
        'customer_count': 'sum',
        'refund_amount': 'sum',
        'cancelled_orders': 'sum'
    }).reset_index()
    store_tgt = st.groupby('store_id')['sales_target'].sum().reset_index()
    store_sum = store_sum.merge(store_tgt, on='store_id')
    store_sum['achievement_rate'] = store_sum['actual_sales'] / store_sum['sales_target']
    store_sum = store_sum.merge(dfs['store_master'][['store_id', 'store_name', 'region', 'city', 'store_type']], on='store_id')
    store_sum = store_sum.sort_values('actual_sales', ascending=False)
    m['store_ranking'] = store_sum

    # 时间趋势（区域级）
    daily = sd.groupby('date').agg({
        'actual_sales': 'sum',
        'order_count': 'sum',
        'customer_count': 'sum',
        'avg_order_value': 'mean',
        'refund_amount': 'sum',
        'cancelled_orders': 'sum'
    }).reset_index().sort_values('date')
    daily['dow'] = pd.to_datetime(daily['date']).dt.day_name()
    daily['is_weekend'] = daily['dow'].isin(['Saturday', 'Sunday'])
    m['daily_trend'] = daily

    # 时间趋势（含目标）
    daily_tgt = st.groupby('date')['sales_target'].sum().reset_index()
    daily = daily.merge(daily_tgt, on='date', how='left')
    m['daily_trend_with_target'] = daily.sort_values('date')

    # 渠道分析
    ch_sum = ch.groupby('channel').agg({'sales_amount': 'sum', 'order_count': 'sum'}).reset_index()
    ch_sum['sales_pct'] = ch_sum['sales_amount'] / ch_sum['sales_amount'].sum()
    m['channel'] = ch_sum.sort_values('sales_amount', ascending=False)

    # 渠道时间趋势
    ch_daily = ch.groupby(['date', 'channel'])['sales_amount'].sum().reset_index()
    m['channel_daily'] = ch_daily

    # 时段分析
    dp_sum = dp.groupby('daypart').agg({'sales_amount': 'sum', 'order_count': 'sum'}).reset_index()
    dp_sum['sales_pct'] = dp_sum['sales_amount'] / dp_sum['sales_amount'].sum()
    m['daypart'] = dp_sum.sort_values('sales_amount', ascending=False)

    # 品类分析
    ca_sum = ca.groupby('category').agg({'sales_amount': 'sum', 'order_count': 'sum'}).reset_index()
    ca_sum['sales_pct'] = ca_sum['sales_amount'] / ca_sum['sales_amount'].sum()
    m['category'] = ca_sum.sort_values('sales_amount', ascending=False)

    # 促销
    m['promo_total'] = pr['promo_sales'].sum()
    m['promo_rate'] = m['promo_total'] / m['total_sales']

    # 退款原因
    rf_reason = rf.groupby('main_reason').agg({'refund_amount': 'sum', 'refund_orders': 'sum'}).reset_index()
    m['refund_reason'] = rf_reason.sort_values('refund_amount', ascending=False)

    # 店长反馈
    m['feedback'] = dfs['store_manager_feedback']

    # 各店最新一天数据
    latest_date = sd['date'].max()
    m['latest_date'] = latest_date
    sd_latest = sd[sd['date'] == latest_date].copy()
    st_latest = st[st['date'] == latest_date].copy()
    sd_latest = sd_latest.merge(st_latest[['store_id', 'sales_target', 'order_target', 'aov_target']], on='store_id', how='left')
    sd_latest['achievement_rate'] = sd_latest['actual_sales'] / sd_latest['sales_target']
    sd_latest = sd_latest.merge(dfs['store_master'][['store_id', 'store_name']], on='store_id')
    m['latest_daily'] = sd_latest.sort_values('actual_sales', ascending=False)

    # 各店渠道最新一天
    ch_latest = ch[ch['date'] == latest_date].copy()
    m['latest_channel'] = ch_latest

    # 各店时段最新一天
    dp_latest = dp[dp['date'] == latest_date].copy()
    m['latest_daypart'] = dp_latest

    # 区域城市汇总
    city_sum = store_sum.groupby('city').agg({
        'actual_sales': 'sum',
        'sales_target': 'sum',
        'order_count': 'sum',
        'store_id': 'count'
    }).reset_index()
    city_sum.columns = ['city', 'actual_sales', 'sales_target', 'order_count', 'store_count']
    city_sum['achievement_rate'] = city_sum['actual_sales'] / city_sum['sales_target']
    city_sum = city_sum.sort_values('actual_sales', ascending=False)
    m['city_summary'] = city_sum

    return m


def fmt(num, dec=0, pct=False, currency=False):
    if pct:
        return f"{num*100:.{dec}f}%"
    if currency:
        return f"{num:,.0f}"
    return f"{num:,.{dec}f}"


def generate_regional_weekly(m):
    """区域经理周报（BI 看板版）"""
    # 门店排名表
    rank_rows = ""
    for i, (_, r) in enumerate(m['store_ranking'].iterrows(), 1):
        cls = "rank-1" if i == 1 else ("rank-last" if i == len(m['store_ranking']) else "")
        rank_rows += f"<tr class='{cls}'><td>{i}</td><td>{r['store_name']}</td><td>{fmt(r['actual_sales'], currency=True)}</td><td>{fmt(r['sales_target'], currency=True)}</td><td>{fmt(r['achievement_rate'], pct=True)}</td><td>{fmt(r['order_count'], dec=0)}</td><td>{fmt(r['actual_sales']/r['order_count'])}</td><td>{fmt(r['refund_amount'], currency=True)}</td></tr>"

    # 时间趋势数据
    daily = m['daily_trend_with_target']
    dates = [d.strftime('%m-%d') for d in daily['date']]
    sales_data = [float(v) for v in daily['actual_sales']]
    target_data = [float(v) if pd.notna(v) else None for v in daily['sales_target']]
    order_data = [int(v) for v in daily['order_count']]
    aov_data = [float(v) for v in daily['avg_order_value']]

    # 周末对比
    weekend_sales = m['daily_trend'][m['daily_trend']['is_weekend']]['actual_sales'].mean()
    weekday_sales = m['daily_trend'][~m['daily_trend']['is_weekend']]['actual_sales'].mean()
    weekend_vs = (weekend_sales / weekday_sales - 1) * 100 if weekday_sales > 0 else 0

    # 销售额趋势图（含目标线）
    sales_chart_id = "regional_sales_trend"
    sales_series = [
        {"name": "实际销售额", "type": "line", "data": sales_data, "smooth": True, "itemStyle": {"color": "#FFE600"}, "lineStyle": {"width": 3}, "areaStyle": {"color": {"type": "linear", "x": 0, "y": 0, "x2": 0, "y2": 1, "colorStops": [{"offset": 0, "color": "rgba(255,230,0,0.4)"}, {"offset": 1, "color": "rgba(255,230,0,0.05)"}]}}},
        {"name": "销售目标", "type": "line", "data": target_data, "smooth": False, "itemStyle": {"color": "#c62828"}, "lineStyle": {"type": "dashed", "width": 2}}
    ]
    sales_opt = _base_option('区域销售额趋势', sales_series, dates, y_axis_name='元')
    sales_script = _chart_script(sales_chart_id, sales_opt)

    # 订单量趋势图
    order_chart_id = "regional_order_trend"
    order_series = [
        {"name": "订单量", "type": "bar", "data": order_data, "itemStyle": {"color": "#1a1a1a", "borderRadius": [3, 3, 0, 0]}}
    ]
    order_opt = _base_option('区域订单量趋势', order_series, dates, y_axis_name='单')
    order_script = _chart_script(order_chart_id, order_opt)

    # 客单价变化图
    aov_chart_id = "regional_aov_trend"
    aov_series = [
        {"name": "客单价", "type": "line", "data": aov_data, "smooth": True, "itemStyle": {"color": "#1565c0"}, "lineStyle": {"width": 3}, "symbol": "circle", "symbolSize": 6}
    ]
    aov_opt = _base_option('区域客单价变化', aov_series, dates, y_axis_name='元')
    aov_script = _chart_script(aov_chart_id, aov_opt)

    # 门店销售对比柱状图
    store_bar_id = "store_compare_bar"
    store_names = [r['store_name'] for _, r in m['store_ranking'].iterrows()]
    store_sales = [float(r['actual_sales']) for _, r in m['store_ranking'].iterrows()]
    store_targets = [float(r['sales_target']) for _, r in m['store_ranking'].iterrows()]
    store_bar_opt = {
        "tooltip": {"trigger": "axis", "axisPointer": {"type": "shadow"}},
        "legend": {"bottom": 0, "textStyle": {"fontSize": 11}},
        "grid": {"left": "3%", "right": "4%", "bottom": "18%", "top": "12%", "containLabel": True},
        "xAxis": {"type": "category", "data": store_names, "axisLabel": {"fontSize": 10, "rotate": 30}},
        "yAxis": {"type": "value", "name": "销售额（元）", "axisLabel": {"fontSize": 11}},
        "series": [
            {"name": "实际销售", "type": "bar", "data": store_sales, "itemStyle": {"color": "#FFE600", "borderRadius": [3, 3, 0, 0]}},
            {"name": "目标", "type": "bar", "data": store_targets, "itemStyle": {"color": "#e0e0e0", "borderRadius": [3, 3, 0, 0]}}
        ],
        "title": {"text": "各门店销售达成对比", "left": "center", "textStyle": {"fontSize": 14, "fontWeight": "bold", "color": "#1a1a1a"}}
    }
    store_bar_script = _chart_script(store_bar_id, store_bar_opt)

    # 城市分布饼图
    city_pie_id = "city_pie"
    city_pie_data = [{"value": float(r['actual_sales']), "name": r['city']} for _, r in m['city_summary'].iterrows()]
    city_pie_opt = {
        "tooltip": {"trigger": "item", "formatter": "{b}: {c}元 ({d}%)"},
        "legend": {"bottom": 0, "textStyle": {"fontSize": 11}},
        "series": [{"name": "城市", "type": "pie", "radius": ["40%", "70%"], "center": ["50%", "45%"], "data": city_pie_data, "itemStyle": {"borderRadius": 6, "borderColor": "#fff", "borderWidth": 2}, "label": {"fontSize": 11}}],
        "color": BRAND_COLORS
    }
    city_pie_script = _chart_script(city_pie_id, city_pie_opt)

    # 渠道
    ch_rows = ""
    for _, r in m['channel'].iterrows():
        ch_rows += f'<div class="bar-chart"><div class="bar-label">{r["channel"]}</div><div class="bar-track"><div class="bar-fill" style="width:{r["sales_pct"]*100:.0f}%;"></div></div><div class="bar-value">{fmt(r["sales_pct"], pct=True)} ({fmt(r["sales_amount"], currency=True)})</div></div>'

    # 时段
    dp_rows = ""
    for _, r in m['daypart'].iterrows():
        dp_rows += f'<div class="bar-chart"><div class="bar-label">{r["daypart"]}</div><div class="bar-track"><div class="bar-fill" style="width:{r["sales_pct"]*100:.0f}%;"></div></div><div class="bar-value">{fmt(r["sales_pct"], pct=True)}</div></div>'

    # 品类
    ca_rows = ""
    for _, r in m['category'].iterrows():
        ca_rows += f'<div class="bar-chart"><div class="bar-label">{r["category"]}</div><div class="bar-track"><div class="bar-fill" style="width:{r["sales_pct"]*100:.0f}%;"></div></div><div class="bar-value">{fmt(r["sales_pct"], pct=True)}</div></div>'

    # 退款原因
    rf_rows = ""
    for _, r in m['refund_reason'].iterrows():
        rf_rows += f"<tr><td>{r['main_reason']}</td><td>{fmt(r['refund_amount'], currency=True)}</td><td>{fmt(r['refund_orders'], dec=0)}</td></tr>"

    # 渠道趋势图（堆叠面积图）
    ch_daily = m['channel_daily']
    ch_types = ch_daily['channel'].unique().tolist()
    ch_dates = sorted(ch_daily['date'].unique().tolist())
    ch_date_strs = [d.strftime('%m-%d') for d in ch_dates]
    ch_series = []
    for ch_name in ch_types:
        ch_data = []
        for d in ch_dates:
            val = ch_daily[(ch_daily['date'] == d) & (ch_daily['channel'] == ch_name)]['sales_amount']
            ch_data.append(float(val.iloc[0]) if not val.empty else 0)
        ch_series.append({"name": ch_name, "type": "line", "stack": "Total", "areaStyle": {}, "smooth": True, "data": ch_data})
    channel_trend_id = "channel_trend"
    channel_trend_opt = _base_option('渠道销售趋势', ch_series, ch_date_strs, y_axis_name='元')
    channel_trend_opt['tooltip']['trigger'] = 'axis'
    channel_trend_opt['legend']['bottom'] = 0
    channel_trend_opt['color'] = BRAND_COLORS
    channel_trend_script = _chart_script(channel_trend_id, channel_trend_opt)

    # 文字总结
    max_day = daily.loc[daily['actual_sales'].idxmax()]
    min_day = daily.loc[daily['actual_sales'].idxmin()]
    mean_sales = daily['actual_sales'].mean()
    anomalies = daily[abs(daily['actual_sales'] - mean_sales) > mean_sales * 0.2]

    summary_parts = []
    date_range = f"{daily['date'].min().strftime('%m月%d日')}-{daily['date'].max().strftime('%m月%d日')}"
    summary_parts.append(f"<strong>销售表现：</strong>{date_range}期间，区域总销售额 {fmt(m['total_sales'], currency=True)}元，目标达成率 {fmt(m['achievement_rate'], pct=True)}。单日最高销售为 <strong>{max_day['date'].strftime('%m月%d日')}</strong>（{fmt(max_day['actual_sales'], currency=True)}元），最低为 <strong>{min_day['date'].strftime('%m月%d日')}</strong>（{fmt(min_day['actual_sales'], currency=True)}元）。")
    summary_parts.append(f"<strong>客流特征：</strong>周末日均销售 {fmt(weekend_sales, currency=True)}元，较工作日{'高' if weekend_vs >= 0 else '低'} <strong>{abs(weekend_vs):.1f}%</strong>。")
    summary_parts.append(f"<strong>渠道结构：</strong>{m['channel'].iloc[0]['channel']} 为最主要渠道，占比 {fmt(m['channel'].iloc[0]['sales_pct'], pct=True)}。")
    summary_parts.append(f"<strong>品类贡献：</strong>{m['category'].iloc[0]['category']} 贡献最大，占比 {fmt(m['category'].iloc[0]['sales_pct'], pct=True)}；时段方面 {m['daypart'].iloc[0]['daypart']} 最强。")

    if not anomalies.empty:
        anomaly_dates = ", ".join([f"<strong>{row['date'].strftime('%m月%d日')}</strong>" for _, row in anomalies.iterrows()])
        summary_parts.append(f"<strong>异常关注：</strong>以下日期销售波动较大需深入分析：{anomaly_dates}。")

    summary_html = "<br><br>".join(summary_parts)

    # 需关注信息
    alerts = []
    if m['achievement_rate'] < 0.95:
        alerts.append(f'<div class="alert-box"><strong>整体目标未达标：</strong>区域整体达成率 {fmt(m["achievement_rate"], pct=True)}，低于 95% 警戒线，需重点推动后进门店。</div>')
    worst = m['store_ranking'].iloc[-1]
    if worst['achievement_rate'] < 0.90:
        alerts.append(f'<div class="alert-box"><strong>尾部门店风险：</strong>{worst["store_name"]} 达成率仅 {fmt(worst["achievement_rate"], pct=True)}，建议立即开展专项帮扶。</div>')
    if m['refund_rate'] > 0.02:
        alerts.append(f'<div class="alert-box"><strong>退款率偏高：</strong>区域整体退款率 {fmt(m["refund_rate"], pct=True)}，主要原因为 {m["refund_reason"].iloc[0]["main_reason"]}，建议优化出品流程。</div>')
    if not alerts:
        alerts.append('<div class="good-box"><strong>运营良好：</strong>当前区域整体指标正常，建议持续关注周末客流及促销 ROI 变化。</div>')

    html = f"""<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>KFC 区域经理周报</title>{EY_CSS}{ECHARTS_CDN}</head><body>
    <div class="container">
        <div class="header"><h1>KFC 区域经理周报</h1><div class="meta">数据周期: {m['daily_trend']['date'].min().strftime('%Y-%m-%d')} 至 {m['daily_trend']['date'].max().strftime('%Y-%m-%d')} | 门店数: {len(m['store_ranking'])} | 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M')}</div></div>
        <div class="content">
            <div class="section">
                <h2>区域整体经营概览</h2>
                <div class="kpi-grid">
                    <div class="kpi-card"><div class="kpi-value">{fmt(m['total_sales'], currency=True)}</div><div class="kpi-label">区域总销售额</div></div>
                    <div class="kpi-card"><div class="kpi-value">{fmt(m['achievement_rate'], pct=True)}</div><div class="kpi-label">目标达成率</div></div>
                    <div class="kpi-card"><div class="kpi-value">{fmt(m['total_orders'], dec=0)}</div><div class="kpi-label">总订单量</div></div>
                    <div class="kpi-card"><div class="kpi-value">{fmt(m['avg_aov'])}</div><div class="kpi-label">平均客单价</div></div>
                    <div class="kpi-card"><div class="kpi-value">{fmt(m['refund_rate'], pct=True)}</div><div class="kpi-label">退款率</div></div>
                    <div class="kpi-card"><div class="kpi-value">{fmt(m['promo_rate'], pct=True)}</div><div class="kpi-label">促销销售占比</div></div>
                </div>
            </div>

            <div class="section">
                <h2>经营趋势总结</h2>
                <div class="summary-box">
                    {summary_html}
                </div>
            </div>

            <div class="section">
                <h2>需关注信息</h2>
                {''.join(alerts)}
            </div>

            <div class="section">
                <h2>销售 & 订单 & 客单价趋势</h2>
                <div class="chart-row">
                    <div class="chart-col">
                        <div class="chart-title">销售额趋势（含目标）</div>
                        <div class="chart-container" id="{sales_chart_id}"></div>
                    </div>
                    <div class="chart-col">
                        <div class="chart-title">订单量趋势</div>
                        <div class="chart-container" id="{order_chart_id}"></div>
                    </div>
                </div>
                <div class="chart-row">
                    <div class="chart-col">
                        <div class="chart-title">客单价变化</div>
                        <div class="chart-container" id="{aov_chart_id}"></div>
                    </div>
                    <div class="chart-col">
                        <div class="chart-title">渠道销售趋势</div>
                        <div class="chart-container" id="{channel_trend_id}"></div>
                    </div>
                </div>
            </div>

            <div class="section">
                <h2>门店排名与对比</h2>
                <div class="chart-row">
                    <div class="chart-col" style="min-width:100%;">
                        <div class="chart-title">各门店销售达成对比</div>
                        <div class="chart-container" id="{store_bar_id}"></div>
                    </div>
                </div>
                <table><thead><tr><th>排名</th><th>门店</th><th>实际销售</th><th>目标</th><th>达成率</th><th>订单量</th><th>客单价</th><th>退款金额</th></tr></thead><tbody>{rank_rows}</tbody></table>
            </div>

            <div style="display:flex;gap:20px;">
                <div class="section" style="flex:1;">
                    <h2>渠道结构</h2>
                    {ch_rows}
                </div>
                <div class="section" style="flex:1;">
                    <h2>时段分布</h2>
                    {dp_rows}
                </div>
            </div>

            <div class="section">
                <h2>品类贡献</h2>
                {ca_rows}
            </div>

            <div class="section">
                <h2>退款分析</h2>
                <table><thead><tr><th>主要原因</th><th>退款金额</th><th>退款单数</th></tr></thead><tbody>{rf_rows}</tbody></table>
            </div>
        </div>
        <div class="footer">*免责声明: 本报表基于数据分析生成，具体经营决策请结合现场实际情况。</div>
    </div>
    {sales_script}
    {order_script}
    {aov_script}
    {channel_trend_script}
    {store_bar_script}
    {city_pie_script}
    </body></html>"""
    return html


def main():
    print("=" * 60)
    print("KFC 区域经理周报生成器 (BI 看板版)")
    print("=" * 60)

    print("\n[1/3] 读取数据...")
    dfs = read_data()
    print(f"      已读取 {len(dfs)} 张数据表")

    print("\n[2/3] 计算指标...")
    metrics = compute_metrics(dfs)
    print(f"      门店数: {len(metrics['store_ranking'])}, 日期范围: {metrics['daily_trend']['date'].min().date()} ~ {metrics['daily_trend']['date'].max().date()}")

    print("\n[3/3] 生成区域经理周报...")
    html = generate_regional_weekly(metrics)
    d = metrics['daily_trend']['date'].max().strftime('%m%d')
    path = os.path.join(OUTPUT_DIR, f'KFC_区域经理周报_{d}.html')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"      [OK] {path}")

    print("\n" + "=" * 60)
    print("[完成] 区域经理周报已生成")
    print("=" * 60)
    input("\n按回车键退出...")


if __name__ == '__main__':
    main()
