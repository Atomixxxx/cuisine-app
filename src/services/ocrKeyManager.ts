import { STORAGE_KEYS } from '../constants/storageKeys';
import { db } from './db';

let cachedApiKey: string | null = null;

export async function getApiKey(): Promise<string> {
  if (cachedApiKey !== null) return cachedApiKey;

  const settings = await db.settings.get('default');
  cachedApiKey = settings?.geminiApiKey ?? '';

  const legacyKey = localStorage.getItem(STORAGE_KEYS.geminiApiKeyLegacy);
  if (legacyKey && !cachedApiKey) {
    cachedApiKey = legacyKey;
    await db.settings.update('default', { geminiApiKey: legacyKey });
    localStorage.removeItem(STORAGE_KEYS.geminiApiKeyLegacy);
  }

  return cachedApiKey;
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  cachedApiKey = trimmed;
  await db.settings.update('default', { geminiApiKey: trimmed });
}

export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return key.length > 0;
}

export function resetOcrApiKeyCache(): void {
  cachedApiKey = null;
}
