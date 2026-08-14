import { randomUUID } from "node:crypto";
import {
  DataAccessDeniedError,
  type AccessControl,
} from "@/modules/admin/permissions/access-control";
import type { BusinessAnalysisContext } from "@/modules/agents/business/business-agent";
import {
  InsightGenerationGuard,
  type InsightGenerationToken,
} from "./insight-generation-guard";
import type { InsightComposer } from "./insight-composer";
import {
  buildInsightSourceCatalog,
  type InsightSourceCatalog,
} from "./insight-source-catalog";
import {
  toInsightSnapshotDto,
  type InsightSnapshot,
  type InsightSnapshotDto,
} from "./insight-types";
import type { LatestInsightRepository } from "./latest-insight-repository";
import { InsightConditionalWriteError } from "./latest-insight-repository";
import { materializeInsightSnapshot } from "./insight-validator";

export type InsightRequestToken = InsightGenerationToken;

export interface InsightApplication {
  beginRequest(
    userId: string,
    requestId?: string,
    startedAt?: number
  ): InsightRequestToken;
  activateRequest(token: InsightRequestToken): boolean;
  generateForAnalysis(
    token: InsightRequestToken,
    analysis: BusinessAnalysisContext
  ): Promise<InsightSnapshot>;
  getLatest(userId: string): Promise<InsightSnapshotDto | null>;
  updateAction(input: {
    userId: string;
    insightId: string;
    actionId: string;
    completed: boolean;
  }): Promise<InsightSnapshotDto>;
}

interface InsightApplicationDependencies {
  repository: LatestInsightRepository;
  guard: InsightGenerationGuard;
  composer: InsightComposer;
  buildCatalog?: (input: {
    intent: BusinessAnalysisContext["intent"];
    analysisData: Record<string, unknown>;
  }) => InsightSourceCatalog;
  accessControl: Pick<AccessControl, "authorizeScope">;
  listStoreIds(): Promise<string[]>;
}

export class StaleInsightGenerationError extends Error {
  constructor() {
    super("A newer insight request is already active.");
    this.name = "StaleInsightGenerationError";
  }
}

export function createInsightApplication({
  repository,
  guard,
  composer,
  buildCatalog = buildInsightSourceCatalog,
  accessControl,
  listStoreIds,
}: InsightApplicationDependencies): InsightApplication {
  async function authorizeSnapshot(
    userId: string,
    snapshot: InsightSnapshot
  ): Promise<void> {
    const availableStoreIds = await listStoreIds();
    const scope = await accessControl.authorizeScope({
      userId,
      requirements: snapshot.accessRequirements,
      requestedStoreIds: snapshot.scope.storeIds,
      availableStoreIds,
      strictStoreScope: true,
    });
    if (!sameStringSet(scope.storeIds, snapshot.scope.storeIds)) {
      throw new DataAccessDeniedError();
    }
  }

  return {
    beginRequest(userId, requestId = randomUUID(), startedAt = Date.now()) {
      return { userId, requestId, startedAt };
    },

    activateRequest(token) {
      return guard.claim(token);
    },

    async generateForAnalysis(token, analysis) {
      if (!guard.isCurrent(token) && !guard.claim(token)) {
        throw new StaleInsightGenerationError();
      }
      const scope = {
        storeIds: [...analysis.storeIds],
        startDate: analysis.startDate,
        endDate: analysis.endDate,
        comparisonLabel: null,
      };
      const catalog = buildCatalog({
        intent: analysis.intent,
        analysisData: analysis.analysisData,
      });
      const draft = await composer.compose({
        question: analysis.question,
        intent: analysis.intent,
        scope,
        catalog,
        attributionNarrative: analysis.attributionNarrative,
      });
      const snapshot = materializeInsightSnapshot({
        userId: token.userId,
        question: analysis.question,
        intent: analysis.intent,
        scope,
        catalog,
        draft,
        accessRequirements: analysis.accessRequirements,
      });
      if (!guard.isCurrent(token)) throw new StaleInsightGenerationError();
      try {
        return await repository.replaceForUser(
          snapshot,
          () => guard.isCurrent(token)
        );
      } catch (error) {
        if (error instanceof InsightConditionalWriteError) {
          throw new StaleInsightGenerationError();
        }
        throw error;
      }
    },

    async getLatest(userId) {
      const snapshot = await repository.findByUserId(userId);
      if (!snapshot) return null;
      await authorizeSnapshot(userId, snapshot);
      return toInsightSnapshotDto(snapshot);
    },

    async updateAction(input) {
      const current = await repository.findByUserId(input.userId);
      if (current) await authorizeSnapshot(input.userId, current);
      const snapshot = await repository.updateActionState(
        input.userId,
        input.insightId,
        input.actionId,
        input.completed
      );
      return toInsightSnapshotDto(snapshot);
    },
  };
}

function sameStringSet(left: string[], right: string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value))
  );
}

export function buildInsightReceipt(snapshot: InsightSnapshot): string {
  const firstFinding = snapshot.findings[0];
  const scopePrompt = snapshot.scope.storeIds.length > 1
    ? "按门店拆解后续行动"
    : "继续查看当前门店的执行重点";
  const findingPrompt = firstFinding
    ? `核查「${firstFinding.title}」的支持证据`
    : "查看本次洞察的支持证据";
  return [
    `洞察与行动已更新：${snapshot.findings.length} 项发现、${snapshot.actions.length} 项行动。`,
    `你可以继续问：${findingPrompt}；${scopePrompt}。`,
  ].join("\n");
}
