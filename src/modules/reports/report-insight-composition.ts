import { DeepSeekChatModel } from "@/modules/agents/shared/deepseek-chat-model";
import { generateReportInsights } from "@/modules/reports/report-insight-generator";

const reportModel = new DeepSeekChatModel({
  model:
    process.env.DEEPSEEK_REPORT_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    "deepseek-v4-flash",
});

export const reportInsightGenerator = {
  generateInsights: (data: Parameters<typeof generateReportInsights>[0]) =>
    generateReportInsights(data, reportModel),
};
