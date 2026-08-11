"use client";

import { useEffect, useState } from "react";
import { createWorkbenchContextRequestLifecycle } from "./workbench-context-lifecycle";
import {
  fetchWorkbenchContext,
  WorkbenchContextClientError,
} from "@/modules/workbench/workbench-context-client";
import type { WorkbenchContext } from "@/modules/workbench/workbench-types";

export interface UseWorkbenchContextResult {
  context: WorkbenchContext | null;
  error: string | null;
  isLoading: boolean;
  reload(): void;
}

export function useWorkbenchContext(): UseWorkbenchContextResult {
  const [requestVersion, setRequestVersion] = useState(0);
  const [context, setContext] = useState<WorkbenchContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const lifecycle = createWorkbenchContextRequestLifecycle();
    setIsLoading(true);
    setError(null);
    fetchWorkbenchContext(controller.signal)
      .then((nextContext) =>
        lifecycle.runIfActive(() => setContext(nextContext))
      )
      .catch((reason: unknown) => {
        if ((reason as Error).name === "AbortError") return;
        if (!lifecycle.runIfActive(() => {})) return;
        if (
          reason instanceof WorkbenchContextClientError &&
          reason.status === 401
        ) {
          window.location.replace("/login?next=/");
          return;
        }
        setContext(null);
        setError(
          reason instanceof Error ? reason.message : "工作台暂时不可用"
        );
      })
      .finally(() => lifecycle.runIfActive(() => setIsLoading(false)));
    return () => {
      lifecycle.deactivate();
      controller.abort();
    };
  }, [requestVersion]);

  return {
    context,
    error,
    isLoading,
    reload: () => setRequestVersion((value) => value + 1),
  };
}
