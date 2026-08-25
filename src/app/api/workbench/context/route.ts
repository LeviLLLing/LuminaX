import { authenticateRequest } from "@/modules/auth/auth-http";
import { workbenchContextApplication } from "@/modules/workbench/workbench-composition";
import { createGetWorkbenchContextHandler } from "./handler";

export const dynamic = "force-dynamic";

export const GET = createGetWorkbenchContextHandler({
  authenticate: authenticateRequest,
  getContext: (user) => workbenchContextApplication.getContext(user),
});
