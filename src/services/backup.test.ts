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
