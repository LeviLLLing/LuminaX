import { authenticateRequest } from "@/modules/auth/auth-http";
import { reportApplication } from "@/modules/reports/report-composition";
import { createPostWeeklyReportHandler } from "./handler";

export const dynamic = "force-dynamic";

export const POST = createPostWeeklyReportHandler({
  authenticate: authenticateRequest,
  generate: (input) => reportApplication.generate(input),
});
