import { STORAGE_KEYS } from '../constants/storageKeys';

const PIN_HASH_KEY = STORAGE_KEYS.pinHash;
const PIN_SALT_KEY = STORAGE_KEYS.pinSalt;
const PIN_UNLOCKED_KEY = STORAGE_KEYS.pinUnlocked;
const PIN_FAILED_ATTEMPTS_KEY = STORAGE_KEYS.pinFailedAttempts;
const PIN_LOCKED_UNTIL_KEY = STORAGE_KEYS.pinLockedUntil;
const LEGACY_PIN_KEY = STORAGE_KEYS.pinLegacyCode;

export const PIN_LENGTH = 4;

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

function canUseCrypto(): boolean {
  return typeof window !== 'undefined' && !!window.crypto?.subtle && !!window.crypto?.getRandomValues;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const maxLen = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (leftBytes[i] ?? 0) ^ (rightBytes[i] ?? 0);
  }
  return diff === 0;
}

function getOrCreateSalt(): string {
  let salt = localStorage.getItem(PIN_SALT_KEY);
  if (salt) return salt;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  salt = bytesToHex(bytes);
  localStorage.setItem(PIN_SALT_KEY, salt);
  return salt;
}

async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}

export function isPinConfigured(): boolean {
  return Boolean(localStorage.getItem(PIN_HASH_KEY) && localStorage.getItem(PIN_SALT_KEY)) || Boolean(localStorage.getItem(LEGACY_PIN_KEY));
}

export function normalizePinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, PIN_LENGTH);
}

export function isPinFormatValid(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export function isPinUnlocked(): boolean {
  return localStorage.getItem(PIN_UNLOCKED_KEY) === '1';
}

export function markPinUnlocked(): void {
  localStorage.setItem(PIN_UNLOCKED_KEY, '1');
}

export function clearPinUnlocked(): void {
  localStorage.removeItem(PIN_UNLOCKED_KEY);
}

export function resetPinFailures(): void {
  localStorage.removeItem(PIN_FAILED_ATTEMPTS_KEY);
  localStorage.removeItem(PIN_LOCKED_UNTIL_KEY);
}

export function getPinLockRemainingMs(): number {
  const raw = localStorage.getItem(PIN_LOCKED_UNTIL_KEY);
  if (!raw) return 0;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= Date.now()) {
    localStorage.removeItem(PIN_LOCKED_UNTIL_KEY);
    return 0;
  }
  return ts - Date.now();
}

export function registerPinFailure(): number {
  const nextAttempts = Number(localStorage.getItem(PIN_FAILED_ATTEMPTS_KEY) || '0') + 1;
  localStorage.setItem(PIN_FAILED_ATTEMPTS_KEY, String(nextAttempts));
  if (nextAttempts < MAX_ATTEMPTS) return 0;
  const lockUntil = Date.now() + LOCKOUT_MS;
  localStorage.setItem(PIN_LOCKED_UNTIL_KEY, String(lockUntil));
  localStorage.removeItem(PIN_FAILED_ATTEMPTS_KEY);
  return LOCKOUT_MS;
}

export async function setPinCode(pin: string): Promise<void> {
  if (!canUseCrypto()) throw new Error('Web Crypto indisponible');
  const salt = getOrCreateSalt();
  const hash = await sha256Hex(`${salt}:${pin}`);
  localStorage.setItem(PIN_HASH_KEY, hash);
  localStorage.removeItem(LEGACY_PIN_KEY);
  clearPinUnlocked();
  resetPinFailures();
}

export async function verifyPinCode(pin: string): Promise<boolean> {
  if (!canUseCrypto()) throw new Error('Web Crypto indisponible');
  const lockRemaining = getPinLockRemainingMs();
  if (lockRemaining > 0) return false;

  const storedHash = localStorage.getItem(PIN_HASH_KEY);
  const salt = localStorage.getItem(PIN_SALT_KEY);
  if (storedHash && salt) {
    const computed = await sha256Hex(`${salt}:${pin}`);
    return timingSafeEqual(storedHash, computed);
  }

  const legacyPin = localStorage.getItem(LEGACY_PIN_KEY);
  if (!legacyPin) return true;
  const legacyMatch = timingSafeEqual(legacyPin, pin);
  if (legacyMatch) await setPinCode(pin);
  return legacyMatch;
}

export async function migrateLegacyPinIfNeeded(): Promise<boolean> {
  const legacyPin = localStorage.getItem(LEGACY_PIN_KEY);
  if (!legacyPin) return false;

  if (!canUseCrypto()) return false;

  const storedHash = localStorage.getItem(PIN_HASH_KEY);
  const salt = localStorage.getItem(PIN_SALT_KEY);
  if (storedHash && salt) {
    localStorage.removeItem(LEGACY_PIN_KEY);
    return true;
  }

  const nextSalt = getOrCreateSalt();
  const hash = await sha256Hex(`${nextSalt}:${legacyPin}`);
  localStorage.setItem(PIN_HASH_KEY, hash);
  localStorage.removeItem(LEGACY_PIN_KEY);
  clearPinUnlocked();
  resetPinFailures();
  return true;
}

export async function removePinCode(): Promise<void> {
  localStorage.removeItem(PIN_HASH_KEY);
  localStorage.removeItem(PIN_SALT_KEY);
  localStorage.removeItem(LEGACY_PIN_KEY);
  clearPinUnlocked();
  resetPinFailures();
}
