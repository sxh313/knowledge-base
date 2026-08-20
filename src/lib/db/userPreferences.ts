import { db, type UserPreference } from './schema';

export async function getUserPreference<T>(
  key: UserPreference['key'],
  fallback: T,
  legacyLocalStorageKey?: string,
): Promise<T> {
  const stored = await db.userPreferences.get(key);
  if (stored) return (Array.isArray(fallback) ? stored.value : { ...fallback, ...(stored.value as object) }) as T;
  if (legacyLocalStorageKey && typeof localStorage !== 'undefined') {
    try {
      const legacy = JSON.parse(localStorage.getItem(legacyLocalStorageKey) || 'null') as T | null;
      if (legacy !== null) {
        await setUserPreference(key, legacy);
        localStorage.removeItem(legacyLocalStorageKey);
        return Array.isArray(fallback) ? legacy : ({ ...fallback, ...(legacy as object) } as T);
      }
    } catch { /* 损坏的旧值不阻塞应用启动。 */ }
  }
  return fallback;
}

export async function setUserPreference<T>(key: UserPreference['key'], value: T): Promise<T> {
  await db.userPreferences.put({ key, value, updatedAt: Date.now() });
  return value;
}
