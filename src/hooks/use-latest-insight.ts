"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchLatestInsight,
  InsightClientError,
  updateLatestInsightAction,
} from "@/modules/insights/insight-client";
import type { InsightSnapshotDto, InsightStreamEvent } from "@/modules/insights/insight-types";

export interface UseLatestInsightResult {
  insight: InsightSnapshotDto | null;
  isLoading: boolean;
  error: string | null;
  generationStatus: "idle" | "generating" | "failed";
  reload(): Promise<InsightSnapshotDto | null>;
  handleStreamEvent(event: InsightStreamEvent): Promise<InsightSnapshotDto | null>;
  toggleAction(actionId: string, completed: boolean): Promise<void>;
}

export function useLatestInsight(): UseLatestInsightResult {
  const [insight, setInsight] = useState<InsightSnapshotDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "generating" | "failed">("idle");
  const insightRef = useRef<InsightSnapshotDto | null>(null);
  const loadSequence = useRef(0);

  const commitInsight = useCallback((next: InsightSnapshotDto | null) => {
    insightRef.current = next;
    setInsight(next);
  }, []);

  const reload = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setIsLoading(true);
    try {
      const next = await fetchLatestInsight();
      if (sequence === loadSequence.current) {
        commitInsight(next);
        setError(null);
      }
      return next;
    } catch (loadError) {
      if (sequence === loadSequence.current) setError(messageOf(loadError));
      throw loadError;
    } finally {
      if (sequence === loadSequence.current) setIsLoading(false);
    }
  }, [commitInsight]);

  useEffect(() => {
    void reload().catch(() => undefined);
  }, [reload]);

  const handleStreamEvent = useCallback(async (event: InsightStreamEvent) => {
    if (event.status === "generating") {
      setGenerationStatus("generating");
      setError(null);
      return insightRef.current;
    }
    if (event.status === "failed") {
      setGenerationStatus("failed");
      setError("洞察更新失败，当前洞察仍可继续使用");
      return insightRef.current;
    }

    try {
      const next = await reload();
      if (next?.id === event.insightId) {
        setGenerationStatus("idle");
        setError(null);
      }
      return next;
    } catch {
      setGenerationStatus("failed");
      return insightRef.current;
    }
  }, [reload]);

  const toggleAction = useCallback(async (actionId: string, completed: boolean) => {
    const previous = insightRef.current;
    if (!previous) return;
    const optimistic: InsightSnapshotDto = {
      ...previous,
      actions: previous.actions.map((action) => action.id === actionId
        ? { ...action, completed, completedAt: completed ? new Date().toISOString() : null }
        : action),
    };
    commitInsight(optimistic);
    setError(null);
    try {
      commitInsight(await updateLatestInsightAction({ insightId: previous.id, actionId, completed }));
    } catch (updateError) {
      commitInsight(previous);
      setError(messageOf(updateError));
      if (updateError instanceof InsightClientError && updateError.status === 409) {
        try {
          await reload();
        } catch {
          // The optimistic state has already been rolled back.
        }
      }
    }
  }, [commitInsight, reload]);

  return { insight, isLoading, error, generationStatus, reload, handleStreamEvent, toggleAction };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Latest insight unavailable";
}
