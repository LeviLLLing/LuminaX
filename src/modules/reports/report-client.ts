import { z } from "zod";

export interface WeeklyReportClientRequest {
  startDate: string;
  endDate: string;
  storeIds: string[];
}

export class ReportClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ReportClientError";
  }
}

const responseSchema = z.object({ html: z.string().min(1) }).strict();

export async function requestWeeklyReport(
  input: WeeklyReportClientRequest,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch("/api/reports/weekly", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (response.status === 401) {
    window.location.replace("/login?next=/");
  }
  if (!response.ok) {
    throw new ReportClientError(
      await readErrorMessage(response),
      response.status
    );
  }
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ReportClientError("周报响应无效。", 500);
  }
  return parsed.data.html;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }
  } catch {
    // Use the stable fallback below.
  }
  return response.status === 403 ? "当前账号没有周报权限。" : "周报生成失败。";
}
