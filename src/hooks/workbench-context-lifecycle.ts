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
