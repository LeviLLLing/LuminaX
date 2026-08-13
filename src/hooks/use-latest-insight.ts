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
  let snapshotRevision = 0;
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
        snapshotRevision += 1;
        setState({ insight, error: null });
      }
      return insight;
    } catch (error) {
      if (sequence === reloadSequence) {
        const authorizationFailed = isAuthorizationError(error);
        if (authorizationFailed) snapshotRevision += 1;
        setState({
          error: messageOf(error),
          ...(authorizationFailed ? { insight: null } : {}),
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
    const previousAction = previous.actions.find((action) => action.id === actionId);
    if (!previousAction) return;
    const sourceInsightId = previous.id;
    const sourceSnapshotRevision = snapshotRevision;
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
        insightId: sourceInsightId,
        actionId,
        completed,
      });
      if (!isCurrentActionRequest()) return;
      if (insight.id !== sourceInsightId) return;
      const acknowledgedAction = insight.actions.find(
        (action) => action.id === actionId
      );
      if (!acknowledgedAction) {
        throw new InsightClientError(500, "Insight action response is invalid");
      }
      const current = state.insight;
      if (!current) return;
      setState({
        insight: {
          ...current,
          actions: current.actions.map((action) =>
            action.id === actionId ? acknowledgedAction : action
          ),
        },
      });
    } catch (error) {
      if (isAuthorizationError(error) && isSourceSnapshotCurrent()) {
        snapshotRevision += 1;
        setState({ insight: null, error: messageOf(error), isLoading: false });
        return;
      }
      if (!isCurrentActionRequest()) return;
      const current = state.insight;
      if (!current) return;
      setState({
        insight: {
          ...current,
          actions: current.actions.map((action) =>
            action.id === actionId ? previousAction : action
          ),
        },
        error: messageOf(error),
      });
      if (error instanceof InsightClientError && error.status === 409) {
        try {
          await reload();
        } catch {
          // Rollback remains visible when refreshing the latest snapshot fails.
        }
      }
    }

    function isCurrentActionRequest(): boolean {
      return (
        isSourceSnapshotCurrent() &&
        actionSequences.get(actionId) === sequence
      );
    }

    function isSourceSnapshotCurrent(): boolean {
      return (
        state.insight?.id === sourceInsightId &&
        snapshotRevision === sourceSnapshotRevision
      );
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

function isAuthorizationError(error: unknown): error is InsightClientError {
  return error instanceof InsightClientError && [401, 403].includes(error.status);
}
