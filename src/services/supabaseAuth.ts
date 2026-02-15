import { STORAGE_KEYS } from '../constants/storageKeys';
import { logger } from './logger';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

interface SessionPayload {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  user?: {
    id?: string;
    email?: string;
  };
}

interface StoredSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  userId?: string;
  email?: string;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function readSession(): StoredSession | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.supabaseAuthSession);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.accessToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null): void {
  if (!canUseStorage()) return;
  if (!session) {
    localStorage.removeItem(STORAGE_KEYS.supabaseAuthSession);
    return;
  }
  localStorage.setItem(STORAGE_KEYS.supabaseAuthSession, JSON.stringify(session));
}

function mapSession(payload: SessionPayload): StoredSession {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: payload.expires_at,
    userId: payload.user?.id,
    email: payload.user?.email,
  };
}

function getHeaders(token?: string): Record<string, string> {
  const authorizationToken = token && token.trim() ? token : SUPABASE_ANON_KEY;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${authorizationToken}`,
    'Content-Type': 'application/json',
  };
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseSession(): { email?: string; userId?: string; expiresAt?: number } | null {
  const session = readSession();
  if (!session) return null;
  return {
    email: session.email,
    userId: session.userId,
    expiresAt: session.expiresAt,
  };
}

export function getSupabaseAccessToken(): string | null {
  const session = readSession();
  if (!session) return null;
  if (session.expiresAt && Math.floor(Date.now() / 1000) >= session.expiresAt - 30) {
    // Token expiré — on ne supprime plus la session ici,
    // le refresh sera tenté par getValidAccessToken()
    return null;
  }
  return session.accessToken;
}

/**
 * Rafraîchit la session via le refresh_token stocké.
 * Retourne le nouveau access_token ou null si échec.
 */
export async function refreshSession(): Promise<string | null> {
  const session = readSession();
  if (!session?.refreshToken || !isSupabaseAuthConfigured()) {
    writeSession(null);
    return null;
  }

  try {
    const endpoint = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });

    if (!response.ok) {
      logger.warn('supabase refresh token failed', { status: response.status });
      writeSession(null);
      return null;
    }

    const payload = (await response.json()) as SessionPayload;
    const refreshed = mapSession(payload);
    writeSession(refreshed);
    logger.info('supabase session refreshed', { email: refreshed.email });
    return refreshed.accessToken;
  } catch (error) {
    logger.warn('supabase refresh token error', { error });
    writeSession(null);
    return null;
  }
}

/**
 * Retourne un access_token valide, en rafraîchissant si nécessaire.
 * C'est cette fonction que le reste de l'app devrait utiliser.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const token = getSupabaseAccessToken();
  if (token) return token;
  // Token expiré ou absent → tenter un refresh
  return refreshSession();
}

export function clearSupabaseSession(): void {
  writeSession(null);
}

/**
 * Restaure la session au démarrage de l'app.
 * Si un refresh_token existe, tente de le rafraîchir pour obtenir
 * un access_token valide. Retourne true si la session est active.
 */
export async function restoreSession(): Promise<boolean> {
  if (!isSupabaseAuthConfigured()) return false;

  const session = readSession();
  if (!session) return false;

  // Token encore valide → session OK
  if (session.expiresAt && Math.floor(Date.now() / 1000) < session.expiresAt - 30) {
    logger.info('supabase session restored (token still valid)', { email: session.email });
    return true;
  }

  // Token expiré → tenter un refresh
  if (session.refreshToken) {
    const newToken = await refreshSession();
    if (newToken) {
      logger.info('supabase session restored via refresh', { email: readSession()?.email });
      return true;
    }
  }

  // Refresh échoué → session perdue
  logger.info('supabase session expired and refresh failed');
  return false;
}

export async function signInSupabase(email: string, password: string): Promise<{ email?: string; userId?: string }> {
  if (!isSupabaseAuthConfigured()) {
    throw new Error('Supabase non configure');
  }

  const endpoint = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Auth error (${response.status})`);
  }

  const payload = (await response.json()) as SessionPayload;
  const session = mapSession(payload);
  writeSession(session);
  logger.info('supabase auth login success', { email: session.email });

  return { email: session.email, userId: session.userId };
}

export async function signOutSupabase(): Promise<void> {
  const token = getSupabaseAccessToken();
  if (!token || !isSupabaseAuthConfigured()) {
    writeSession(null);
    return;
  }

  try {
    const endpoint = `${SUPABASE_URL}/auth/v1/logout`;
    await fetch(endpoint, {
      method: 'POST',
      headers: getHeaders(token),
    });
  } catch (error) {
    logger.warn('supabase auth logout request failed', { error });
  } finally {
    writeSession(null);
  }
}
