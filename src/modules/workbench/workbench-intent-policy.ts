import type { IntentViewMetadata } from "@/modules/chat/view-router";
import type { WorkbenchContext } from "./workbench-types";

export function authorizeIntentMetadata(
  metadata: IntentViewMetadata,
  context: WorkbenchContext
): IntentViewMetadata | null {
  if (
    metadata.intent === "irrelevant" ||
    !context.availableIntents.includes(metadata.intent)
  ) {
    return null;
  }

  const requestedStoreIds = [...new Set(metadata.storeIds)];
  const storeIds = requestedStoreIds.filter((storeId) =>
    context.availableStoreIds.includes(storeId)
  );
  if (requestedStoreIds.length > 0 && storeIds.length === 0) return null;

  return { ...metadata, storeIds };
}
