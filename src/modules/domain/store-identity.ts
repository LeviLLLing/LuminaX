import { STORE_DISPLAY_INFO } from "@/modules/domain/constants";

export function toDatabaseStoreId(storeId: string): string {
  return /^S\d{3}$/.test(storeId) ? `KFC${storeId.slice(1)}` : storeId;
}

export function toExternalStoreId(storeId: string): string {
  return /^KFC\d{3}$/i.test(storeId)
    ? `S${storeId.slice(3)}`.toUpperCase()
    : storeId;
}

export function normalizeExternalStoreRecord<T extends object>(record: T): T {
  const normalized = { ...record } as Record<string, unknown>;
  const snakeStoreId =
    typeof normalized.store_id === "string" ? normalized.store_id : null;
  const camelStoreId =
    typeof normalized.storeId === "string" ? normalized.storeId : null;
  const databaseStoreId = snakeStoreId || camelStoreId;

  if (!databaseStoreId) return normalized as T;

  const externalStoreId = toExternalStoreId(databaseStoreId);
  if (snakeStoreId) normalized.store_id = externalStoreId;
  if (camelStoreId) normalized.storeId = externalStoreId;

  const displayName = STORE_DISPLAY_INFO[externalStoreId]?.name;
  if (displayName && "store_name" in normalized) {
    normalized.store_name = displayName;
  }
  if (displayName && "storeName" in normalized) {
    normalized.storeName = displayName;
  }

  return normalized as T;
}
