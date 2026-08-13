"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  fetchLatestInsight,
  InsightClientError,
  updateLatestInsightAction,
  type UpdateLatestInsightActionInput,
} from "@/modules/insights/insight-client";
import type {
  InsightSnapshotDto,
  InsightStreamEvent,
} from "@/modules/insights/insight-types";

export interface LatestInsightState {
  insight: InsightSnapshotDto | null;
  isLoading: boolean;
  error: string | null;
  generationStatus: "idle" | "generating" | "failed";
}

export interface UseLatestInsightResult extends LatestInsightState {
  reload(): Promise<InsightSnapshotDto | null>;
  handleStreamEvent(event: InsightStreamEvent): Promise<InsightSnapshotDto | null>;
  toggleAction(actionId: string, completed: boolean): Promise<void>;
}

interface LatestInsightStateDependencies {
  fetchLatest(): Promise<InsightSnapshotDto | null>;
  updateAction(input: UpdateLatestInsightActionInput): Promise<InsightSnapshotDto>;
  now(): string;
}

export interface LatestInsightStateController {
  getState(): LatestInsightState;
  subscribe(listener: (state: LatestInsightState) => void): () => void;
  reload(): Promise<InsightSnapshotDto | null>;
  handleStreamEvent(event: InsightStreamEvent): Promise<InsightSnapshotDto | null>;
  toggleAction(actionId: string, completed: boolean): Promise<void>;
}

export function createLatestInsightStateController(
  dependencies: LatestInsightStateDependencies
): LatestInsightStateController {
  let state: LatestInsightState = {
    insight: null,
    isLoading: true,
    error: null,
    generationStatus: "idle",
  };
  let reloadSequence = 0;
  const actionSequences = new Map<string, number>();
  const listeners = new Set<(state: LatestInsightState) => void>();

  const setState = (patch: Partial<LatestInsightState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener(state));
  };

  const reload = async (): Promise<InsightSnapshotDto | null> => {
    const sequence = ++reloadSequence;
    setState({ isLoading: true });
    try {
      const insight = await dependencies.fetchLatest();
      if (sequence === reloadSequence) {
        setState({ insight, error: null });
      }
      return insight;
    } catch (error) {
      if (sequence === reloadSequence) {
        setState({
          error: messageOf(error),
          ...(error instanceof InsightClientError && [401, 403].includes(error.status)
            ? { insight: null }
            : {}),
        });
      }
      throw error;
    } finally {
      if (sequence === reloadSequence) setState({ isLoading: false });
    }
  };

  const handleStreamEvent = async (
    event: InsightStreamEvent
  ): Promise<InsightSnapshotDto | null> => {
    if (event.status === "generating") {
      reloadSequence += 1;
      setState({ generationStatus: "generating", error: null, isLoading: false });
      return state.insight;
    }
    if (event.status === "failed") {
      reloadSequence += 1;
      setState({
        generationStatus: "failed",
        error: "洞察更新失败，当前洞察仍可继续使用",
        isLoading: false,
      });
      return state.insight;
    }

    const updatedReloadSequence = reloadSequence + 1;
    try {
      const insight = await reload();
      if (updatedReloadSequence !== reloadSequence) return state.insight;
      if (state.insight?.id === event.insightId) {
        setState({ generationStatus: "idle", error: null });
      }
      return insight;
    } catch {
      if (updatedReloadSequence === reloadSequence) {
        setState({ generationStatus: "failed" });
      }
      return state.insight;
    }
  };

  const toggleAction = async (
    actionId: string,
    completed: boolean
  ): Promise<void> => {
    const previous = state.insight;
    if (!previous) return;
    const sequence = (actionSequences.get(actionId) ?? 0) + 1;
    actionSequences.set(actionId, sequence);
    setState({
      error: null,
      insight: {
        ...previous,
        actions: previous.actions.map((action) =>
          action.id === actionId
            ? {
                ...action,
                completed,
                completedAt: completed ? dependencies.now() : null,
              }
            : action
        ),
      },
    });
    try {
      const insight = await dependencies.updateAction({
        insightId: previous.id,
        actionId,
        completed,
      });
      if (actionSequences.get(actionId) === sequence) setState({ insight });
    } catch (error) {
      if (actionSequences.get(actionId) !== sequence) return;
      setState({ insight: previous, error: messageOf(error) });
      if (error instanceof InsightClientError && error.status === 409) {
        try {
          await reload();
        } catch {
          // Rollback remains visible when refreshing the latest snapshot fails.
        }
      }
    }
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reload,
    handleStreamEvent,
    toggleAction,
  };
}

export function useLatestInsight(): UseLatestInsightResult {
  const [controller] = useState(() =>
    createLatestInsightStateController({
      fetchLatest: fetchLatestInsight,
      updateAction: updateLatestInsightAction,
      now: () => new Date().toISOString(),
    })
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );

  useEffect(() => {
    void controller.reload().catch(() => undefined);
  }, [controller]);

  return {
    ...state,
    reload: controller.reload,
    handleStreamEvent: controller.handleStreamEvent,
    toggleAction: controller.toggleAction,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Latest insight unavailable";
}
