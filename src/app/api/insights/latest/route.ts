import { authenticateRequest } from "@/modules/auth/auth-http";
import { insightApplication } from "@/modules/insights/insight-composition";
import { createGetLatestInsightHandler } from "./handler";

export const dynamic = "force-dynamic";

export const GET = createGetLatestInsightHandler({
  authenticate: authenticateRequest,
  getLatest: (userId) => insightApplication.getLatest(userId),
});
