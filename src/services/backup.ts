import { db } from './db';
import { sanitize } from '../utils';
import { STORAGE_KEYS } from '../constants/storageKeys';
import type {
  AppSettings,
  Equipment,
  Invoice,
  InvoiceItem,
  PriceHistory,
  ProductTrace,
  Task,
  TemperatureRecord,
  OilChangeRecord,
} from '../types';

export const LAST_BACKUP_KEY = STORAGE_KEYS.backupLastAt;
export const AUTO_BACKUP_ENABLED_KEY = STORAGE_KEYS.backupAutoEnabled;
export const LAST_AUTO_BACKUP_KEY = STORAGE_KEYS.backupLastAutoAt;
export const AUTO_BACKUP_SNAPSHOT_KEY = STORAGE_KEYS.backupAutoSnapshotLegacy;
const AUTO_BACKUP_SNAPSHOT_ID = 'weekly';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface BackupPayload {
  version: number;
  exportedAt: string;
  equipment: Equipment[];
  temperatureRecords: TemperatureRecord[];
  oilChangeRecords: OilChangeRecord[];
  tasks: Task[];
  productTraces: ProductTrace[];
  invoices: Invoice[];
  priceHistory: PriceHistory[];
  settings: AppSettings[];
}

export type ValidatedBackupPayload = BackupPayload;

type UnknownRecord = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSanitizedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = sanitize(value).trim();
  return cleaned.length > 0 ? cleaned : null;
}

function toOptionalSanitizedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = sanitize(value).trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function toSanitizedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => toOptionalSanitizedString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return null;
}

function parseEquipment(value: unknown): Equipment | null {
  if (!isObject(value)) return null;
  const id = toSanitizedString(value.id);
  const name = toSanitizedString(value.name);
  const type = value.type;
  const minTemp = toNumber(value.minTemp);
  const maxTemp = toNumber(value.maxTemp);
  const order = toNumber(value.order);
  if (!id || !name || minTemp === null || maxTemp === null || order === null) return null;
  if (type !== 'fridge' && type !== 'freezer' && type !== 'cold_room') return null;
  return { id, name, type, minTemp, maxTemp, order: Math.round(order) };
}

function parseTemperatureRecord(value: unknown): TemperatureRecord | null {
  if (!isObject(value)) return null;
  const id = toSanitizedString(value.id);
  const equipmentId = toSanitizedString(value.equipmentId);
  const temperature = toNumber(value.temperature);
  const timestamp = toDate(value.timestamp);
  const isCompliant = toBoolean(value.isCompliant);
  const signature = toOptionalSanitizedString(value.signature);
  if (!id || !equipmentId || temperature === null || !timestamp || isCompliant === null) return null;
  return { id, equipmentId, temperature, timestamp, isCompliant, signature };
}

function parseOilChangeRecord(value: unknown): OilChangeRecord | null {
  if (!isObject(value)) return null;
  const id = toSanitizedString(value.id);
  const fryerId = toSanitizedString(value.fryerId);
  const changedAt = toDate(value.changedAt);
  const action = value.action;
  const operator = toOptionalSanitizedString(value.operator);
  if (!id || !fryerId || !changedAt) return null;
  if (action !== 'changed') return null;
  return { id, fryerId, changedAt, action, operator };
}

function parseTask(value: unknown): Task | null {
  if (!isObject(value)) return null;
  const id = toSanitizedString(value.id);
  const title = toSanitizedString(value.title);
  const category = value.category;
  const priority = value.priority;
  const completed = toBoolean(value.completed);
  const recurring = value.recurring;
  const createdAt = toDate(value.createdAt);
  const completedAt = toDate(value.completedAt);
  const archived = toBoolean(value.archived);
  const order = toNumber(value.order);
  const estimatedTime = toNumber(value.estimatedTime);
  const notes = toOptionalSanitizedString(value.notes);
  const validCategory =
    category === 'entrees' ||
    category === 'plats' ||
    category === 'desserts' ||
    category === 'mise_en_place' ||
    category === 'nettoyage' ||
    category === 'commandes' ||
    category === 'autre';
  const validPriority = priority === 'high' || priority === 'normal' || priority === 'low';
  const validRecurring = recurring === null || recurring === 'daily' || recurring === 'weekly';
  if (!id || !title || !validCategory || !validPriority || completed === null || !createdAt || archived === null || order === null) {
    return null;
  }
  if (!validRecurring) return null;
  return {
    id,
    title,
    category,
    priority,
    completed,
    recurring,
    createdAt,
    completedAt: completedAt || undefined,
    archived,
    order: Math.round(order),
    estimatedTime: estimatedTime ?? undefined,
    notes,
  };
}

function parseProductTrace(value: unknown): ProductTrace | null {
  if (!isObject(value)) return null;
  const id = toSanitizedString(value.id);
  const productName = toSanitizedString(value.productName);
  const supplier = toSanitizedString(value.supplier);
  const lotNumber = toSanitizedString(value.lotNumber);
  const receptionDate = toDate(value.receptionDate);
  const expirationDate = toDate(value.expirationDate);
  const category = toSanitizedString(value.category);
  const scannedAt = toDate(value.scannedAt);
  const barcode = toOptionalSanitizedString(value.barcode);
  const photoUrl = toOptionalSanitizedString(value.photoUrl);
  const allergens = toSanitizedStringArray(value.allergens);
  if (!id || !productName || !supplier || !lotNumber || !receptionDate || !expirationDate || !category || !scannedAt) {
    return null;
  }
  return {
    id,
    productName,
    supplier,
    lotNumber,
    receptionDate,
    expirationDate,
    category,
    scannedAt,
    barcode,
    photoUrl,
    allergens,
  };
}

function parseInvoiceItem(value: unknown): InvoiceItem | null {
  if (!isObject(value)) return null;
  const designation = toSanitizedString(value.designation);
  const quantity = toNumber(value.quantity);
  const unitPriceHT = toNumber(value.unitPriceHT);
  const totalPriceHT = toNumber(value.totalPriceHT);
  if (!designation || quantity === null || unitPriceHT === null || totalPriceHT === null) return null;
  return { designation, quantity, unitPriceHT, totalPriceHT };
}

function parseInvoice(value: unknown): Invoice | null {
  if (!isObject(value)) return null;
  const id = toSanitizedString(value.id);
  const supplier = toSanitizedString(value.supplier);
  const invoiceNumber = toSanitizedString(value.invoiceNumber);
  const invoiceDate = toDate(value.invoiceDate);
  const totalHT = toNumber(value.totalHT);
  const totalTVA = toNumber(value.totalTVA);
  const totalTTC = toNumber(value.totalTTC);
  const ocrText = sanitize(typeof value.ocrText === 'string' ? value.ocrText : '');
  const scannedAt = toDate(value.scannedAt);
  if (!id || !supplier || !invoiceNumber || !invoiceDate || totalHT === null || totalTVA === null || totalTTC === null || !scannedAt) {
    return null;
  }

  const itemsRaw = Array.isArray(value.items) ? value.items : [];
  const items: InvoiceItem[] = [];
  for (const itemRaw of itemsRaw) {
    const item = parseInvoiceItem(itemRaw);
    if (!item) return null;
    items.push(item);
  }

  const tagsRaw = Array.isArray(value.tags) ? value.tags : [];
  const tags = tagsRaw
    .map((tag) => toSanitizedString(tag))
    .filter((tag): tag is string => Boolean(tag));

  return {
    id,
    images: [],
    supplier,
    invoiceNumber,
    invoiceDate,
    items,
    totalHT,
    totalTVA,
    totalTTC,
    ocrText,
    tags,
    scannedAt,
  };
}

function parsePriceHistory(value: unknown): PriceHistory | null {
  if (!isObject(value)) return null;
  const id = toSanitizedString(value.id);
  const itemName = toSanitizedString(value.itemName);
  const supplier = toSanitizedString(value.supplier);
  const averagePrice = toNumber(value.averagePrice);
  const minPrice = toNumber(value.minPrice);
  const maxPrice = toNumber(value.maxPrice);
  if (!id || !itemName || !supplier || averagePrice === null || minPrice === null || maxPrice === null) return null;

  const pricesRaw = Array.isArray(value.prices) ? value.prices : [];
  const prices: { date: Date; price: number }[] = [];
  for (const entry of pricesRaw) {
    if (!isObject(entry)) return null;
    const date = toDate(entry.date);
    const price = toNumber(entry.price);
    if (!date || price === null) return null;
    prices.push({ date, price });
  }

  return { id, itemName, supplier, prices, averagePrice, minPrice, maxPrice };
}

function parseSettings(value: unknown): AppSettings | null {
  if (!isObject(value)) return null;
  const id = toSanitizedString(value.id);
  const establishmentName = toSanitizedString(value.establishmentName);
  const darkMode = toBoolean(value.darkMode);
  const onboardingDone = toBoolean(value.onboardingDone);
  const priceAlertThreshold = toNumber(value.priceAlertThreshold);
  if (!id || !establishmentName || darkMode === null || onboardingDone === null || priceAlertThreshold === null) return null;
  // Never restore geminiApiKey from backup — user must re-enter it
  return { id, establishmentName, darkMode, onboardingDone, priceAlertThreshold };
}

function parseArray<T>(value: unknown, parser: (input: unknown) => T | null): T[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const parsed: T[] = [];
  for (const entry of value) {
    const row = parser(entry);
    if (!row) return null;
    parsed.push(row);
  }
  return parsed;
}

export function validateBackupImportPayload(value: unknown): ValidatedBackupPayload | null {
  if (!isObject(value)) return null;

  const version = toNumber(value.version);
  const exportedAtDate = toDate(value.exportedAt);
  if (version === null || version < 1 || !exportedAtDate) return null;

  const equipment = parseArray(value.equipment, parseEquipment);
  const temperatureRecords = parseArray(value.temperatureRecords, parseTemperatureRecord);
  const oilChangeRecords = parseArray(value.oilChangeRecords, parseOilChangeRecord);
  const tasks = parseArray(value.tasks, parseTask);
  const productTraces = parseArray(value.productTraces, parseProductTrace);
  const invoices = parseArray(value.invoices, parseInvoice);
  const priceHistory = parseArray(value.priceHistory, parsePriceHistory);
  const settings = parseArray(value.settings, parseSettings);

  if (!equipment || !temperatureRecords || !oilChangeRecords || !tasks || !productTraces || !invoices || !priceHistory || !settings) {
    return null;
  }

  return {
    version: Math.round(version),
    exportedAt: exportedAtDate.toISOString(),
    equipment,
    temperatureRecords,
    oilChangeRecords,
    tasks,
    productTraces,
    invoices,
    priceHistory,
    settings,
  };
}

export function isAutoBackupEnabled(): boolean {
  return localStorage.getItem(AUTO_BACKUP_ENABLED_KEY) !== '0';
}

export function setAutoBackupEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_BACKUP_ENABLED_KEY, enabled ? '1' : '0');
}

function markBackup(at: string): void {
  localStorage.setItem(LAST_BACKUP_KEY, at);
  window.dispatchEvent(new Event('cuisine-backup-updated'));
}

export async function buildBackupPayload(): Promise<BackupPayload> {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    equipment: await db.equipment.toArray(),
    temperatureRecords: await db.temperatureRecords.toArray(),
    oilChangeRecords: await db.oilChangeRecords.toArray(),
    tasks: await db.tasks.toArray(),
    productTraces: (await db.productTraces.toArray()).map((p) => ({
      ...p,
      photo: undefined,
    })),
    invoices: (await db.invoices.toArray()).map((i) => ({
      ...i,
      images: [],
    })),
    priceHistory: await db.priceHistory.toArray(),
    settings: (await db.settings.toArray()).map(({ geminiApiKey: _removed, ...rest }) => rest as AppSettings),
  };
}

// ---- AES-GCM encryption (Web Crypto, 0 dependencies) ----

const ENCRYPTION_HEADER = 'CUISINE_ENC_V1';

async function deriveKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptBackup(json: string, password: string): Promise<ArrayBuffer> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = saltBytes.buffer.slice(0);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(json));
  const header = new TextEncoder().encode(ENCRYPTION_HEADER);
  const buf = new Uint8Array(header.length + saltBytes.length + iv.length + ciphertext.byteLength);
  buf.set(header, 0);
  buf.set(saltBytes, header.length);
  buf.set(iv, header.length + saltBytes.length);
  buf.set(new Uint8Array(ciphertext), header.length + saltBytes.length + iv.length);
  return buf.buffer;
}

export function isEncryptedBackup(data: ArrayBuffer): boolean {
  const header = new TextEncoder().encode(ENCRYPTION_HEADER);
  if (data.byteLength < header.length) return false;
  const prefix = new Uint8Array(data, 0, header.length);
  return prefix.every((b, i) => b === header[i]);
}

export async function decryptBackup(data: ArrayBuffer, password: string): Promise<string> {
  const header = new TextEncoder().encode(ENCRYPTION_HEADER);
  const offset = header.length;
  const salt = data.slice(offset, offset + 16);
  const iv = new Uint8Array(data, offset + 16, 12);
  const ciphertext = new Uint8Array(data, offset + 28);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

export function downloadBackup(payload: BackupPayload, filenamePrefix = 'cuisine-backup'): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  markBackup(new Date().toISOString());
}

export async function downloadEncryptedBackup(payload: BackupPayload, password: string, filenamePrefix = 'cuisine-backup'): Promise<void> {
  const json = JSON.stringify(payload, null, 2);
  const encrypted = await encryptBackup(json, password);
  const blob = new Blob([encrypted], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${new Date().toISOString().split('T')[0]}.enc`;
  a.click();
  URL.revokeObjectURL(url);
  markBackup(new Date().toISOString());
}

async function getStoredAutoBackupSnapshot(): Promise<string | null> {
  const stored = await db.backupSnapshots.get(AUTO_BACKUP_SNAPSHOT_ID);
  if (stored?.payload) return stored.payload;

  // Migrate old snapshot from localStorage to IndexedDB once.
  const legacy = localStorage.getItem(AUTO_BACKUP_SNAPSHOT_KEY);
  if (!legacy) return null;

  await db.backupSnapshots.put({
    id: AUTO_BACKUP_SNAPSHOT_ID,
    payload: legacy,
    createdAt: new Date(),
  });
  localStorage.removeItem(AUTO_BACKUP_SNAPSHOT_KEY);
  return legacy;
}

export async function exportStoredAutoBackup(): Promise<boolean> {
  const raw = await getStoredAutoBackupSnapshot();
  if (!raw) return false;
  const blob = new Blob([raw], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuisine-auto-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  markBackup(new Date().toISOString());
  return true;
}

export async function runWeeklyAutoBackup(): Promise<'done' | 'skipped'> {
  if (!isAutoBackupEnabled()) return 'skipped';

  const lastAuto = localStorage.getItem(LAST_AUTO_BACKUP_KEY);
  if (lastAuto) {
    const ts = new Date(lastAuto).getTime();
    if (!Number.isNaN(ts) && Date.now() - ts < WEEK_MS) return 'skipped';
  }

  const payload = await buildBackupPayload();
  const nowIso = new Date().toISOString();
  await db.backupSnapshots.put({
    id: AUTO_BACKUP_SNAPSHOT_ID,
    payload: JSON.stringify(payload),
    createdAt: new Date(nowIso),
  });
  localStorage.setItem(LAST_AUTO_BACKUP_KEY, nowIso);
  markBackup(nowIso);
  return 'done';
}
