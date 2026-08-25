import { authenticateRequest } from "@/modules/auth/auth-http";
import { insightApplication } from "@/modules/insights/insight-composition";
import { createPatchInsightActionHandler } from "./handler";

export const dynamic = "force-dynamic";

export const PATCH = createPatchInsightActionHandler({
  authenticate: authenticateRequest,
  updateAction: (input) => insightApplication.updateAction(input),
});
