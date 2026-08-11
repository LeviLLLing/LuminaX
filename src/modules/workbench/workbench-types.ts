import type { AnalysisIntent } from "@/modules/domain/analysis-types";

export type WorkbenchTemplateId = "regional_manager" | "default";
export type WorkbenchIntent = Exclude<AnalysisIntent, "irrelevant">;

export interface WorkbenchTemplate {
  id: WorkbenchTemplateId;
  intentOrder: readonly WorkbenchIntent[];
}

export interface WorkbenchContext {
  templateId: WorkbenchTemplateId;
  availableStoreIds: string[];
  availableMetricCodes: string[];
  availableIntents: WorkbenchIntent[];
  canAccessAdmin: boolean;
}
