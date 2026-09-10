import {
  getWorkbenchPresentationProfile,
  type InsightView,
} from "@/modules/workbench/workbench-presentation";
import type { WorkbenchTemplateId } from "@/modules/workbench/workbench-types";

export interface WorkbenchContextRequestLifecycle {
  deactivate(): void;
  runIfActive(effect: () => void): boolean;
}

export function createWorkbenchContextRequestLifecycle(): WorkbenchContextRequestLifecycle {
  let active = true;

  return {
    deactivate() {
      active = false;
    },
    runIfActive(effect) {
      if (!active) return false;
      effect();
      return true;
    },
  };
}

export function resolveTemplateDefaultView(
  currentView: InsightView,
  previousTemplateId: WorkbenchTemplateId | null,
  nextTemplateId: WorkbenchTemplateId
): InsightView {
  return previousTemplateId === nextTemplateId
    ? currentView
    : getWorkbenchPresentationProfile(nextTemplateId).defaultView;
}
