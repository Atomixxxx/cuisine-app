import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db';
import {
  AUTO_BACKUP_SNAPSHOT_KEY,
  exportStoredAutoBackup,
  runWeeklyAutoBackup,
  validateBackupImportPayload,
} from './backup';

function ensureDownloadApisMocked(): void {
  if (!URL.createObjectURL) {
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mock-url'),
    });
  } else {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
  }

  if (!URL.revokeObjectURL) {
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  } else {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  }

  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
}

beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  await db.backupSnapshots.clear();
  await db.equipment.clear();
  await db.temperatureRecords.clear();
  await db.tasks.clear();
  await db.productTraces.clear();
  await db.invoices.clear();
  await db.orders.clear();
  await db.priceHistory.clear();
  await db.settings.clear();
});

describe('backup service', () => {
  it('rejects malformed import payload', () => {
    const invalid = validateBackupImportPayload({
      version: 1,
      exportedAt: new Date().toISOString(),
      equipment: [{ id: 'eq-1' }],
    });

    expect(invalid).toBeNull();
  });

  it('imports and sanitizes product allergens from backup payload', () => {
    const valid = validateBackupImportPayload({
      version: 1,
      exportedAt: new Date().toISOString(),
      productTraces: [
        {
          id: 'p-1',
          productName: 'Lait',
          supplier: 'Metro',
          lotNumber: 'LOT-1',
          receptionDate: '2026-02-01T00:00:00.000Z',
          expirationDate: '2026-02-10T00:00:00.000Z',
          category: 'Produits laitiers',
          scannedAt: '2026-02-01T08:00:00.000Z',
          allergens: ['Lait', '  Lait  ', '<b>Soja</b>', 42],
        },
      ],
    });

    expect(valid).not.toBeNull();
    expect(valid?.productTraces[0].allergens).toEqual(['Lait', 'Soja']);
  });

  it('stores weekly auto-backup snapshot in IndexedDB and skips on second run', async () => {
    const first = await runWeeklyAutoBackup();
    const second = await runWeeklyAutoBackup();
    const snapshot = await db.backupSnapshots.get('weekly');

    expect(first).toBe('done');
    expect(second).toBe('skipped');
    expect(snapshot?.payload).toBeTruthy();
  });

  it('migrates legacy localStorage auto-backup snapshot and exports it', async () => {
    ensureDownloadApisMocked();
    localStorage.setItem(
      AUTO_BACKUP_SNAPSHOT_KEY,
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString() }),
    );

    const exported = await exportStoredAutoBackup();
    const snapshot = await db.backupSnapshots.get('weekly');

    expect(exported).toBe(true);
    expect(localStorage.getItem(AUTO_BACKUP_SNAPSHOT_KEY)).toBeNull();
    expect(snapshot?.payload).toContain('"version":1');
  });
});
