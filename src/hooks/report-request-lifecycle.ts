export interface ReportRequestLifecycle {
  deactivate(): void;
  runIfActive(effect: () => void): boolean;
}

export function createReportRequestLifecycle(): ReportRequestLifecycle {
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
