export const WEEKLY_REPORT_STYLES = `
body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; margin: 0; padding: 0; background: #f4f6f9; color: #1a1a1a; line-height: 1.6; }
.container { max-width: 1280px; margin: 20px auto; background: #fff; box-shadow: 0 6px 30px rgba(0,0,0,0.10); border-radius: 8px; overflow: hidden; }
.header { background: #1a1a1a; color: #FFE600; padding: 28px 36px; border-bottom: 5px solid #FFE600; }
.header h1 { margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 1px; }
.meta { color: #bbb; font-size: 12px; margin-top: 8px; font-weight: 500; }
.content { padding: 28px 36px 36px; }
.section { margin-bottom: 28px; }
.section h2 { color: #1a1a1a; border-bottom: 3px solid #FFE600; padding-bottom: 8px; font-size: 17px; font-weight: 700; margin-top: 0; display: flex; align-items: center; gap: 8px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin: 16px 0; }
.kpi-card { background: #fff; border-radius: 8px; padding: 18px; border: 1px solid #e8e8e8; border-top: 4px solid #FFE600; box-shadow: 0 2px 8px rgba(0,0,0,0.04); transition: transform 0.2s; }
.kpi-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.kpi-value { font-size: 24px; font-weight: 700; color: #1a1a1a; }
.kpi-label { font-size: 11px; color: #888; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.summary-box { background: #fffbe6; border-left: 4px solid #FFE600; padding: 14px 18px; margin: 12px 0; border-radius: 0 6px 6px 0; font-size: 13px; line-height: 1.8; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; background: #fff; }
th { background: #1a1a1a; color: #FFE600; padding: 10px 12px; text-align: left; font-weight: 600; }
td { padding: 8px 12px; border-bottom: 1px solid #e8e8e8; }
tr:nth-child(even) { background: #fafafa; }
.chart-container { width: 100%; height: 320px; background: #fff; border-radius: 6px; margin: 12px 0; }
.chart-row { display: flex; gap: 20px; flex-wrap: wrap; }
.chart-col { flex: 1; min-width: 380px; }
.chart-title { font-size: 13px; font-weight: 600; color: #444; margin-bottom: 6px; padding-left: 4px; }
.footer { margin-top: 24px; padding-top: 14px; border-top: 1px solid #e0e0e0; font-size: 10px; color: #999; text-align: center; }
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-left: 6px; }
.tag-up { background: #e8f5e9; color: #2e7d32; }
.tag-down { background: #ffebee; color: #c62828; }
.tag-warn { background: #fff3e0; color: #e65100; }
.alert { border-left: 4px solid; padding: 12px 16px; margin: 8px 0; border-radius: 0 6px 6px 0; font-size: 13px; }
.alert-danger { background:#ffebee; border-left-color:#c62828; }
.alert-success { background:#e8f5e9; border-left-color:#2e7d32; }
`;
