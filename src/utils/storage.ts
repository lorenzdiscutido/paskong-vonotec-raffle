export const STORAGE_KEYS = {
  participants: 'celestia_raffle_participants_v1',
  history: 'celestia_raffle_history_v2',
  settings: 'celestia_raffle_settings_v2',
} as const;

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[storage] Failed to load "${key}", using fallback:`, err);
    return fallback;
  }
}

export function saveToStorage<T>(
  key: string,
  value: T
): { ok: boolean; quotaExceeded: boolean } {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true, quotaExceeded: false };
  } catch (err) {
    const isQuota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22);
    return { ok: false, quotaExceeded: isQuota };
  }
}
