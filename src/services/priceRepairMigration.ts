import { STORAGE_KEYS } from '../constants/storageKeys';
import { db } from './db';
import { useAppStore } from '../stores/appStore';
import { logger } from './logger';

const MIGRATION_VERSION = 'v1';

/**
 * Parse a number that may use French formatting (comma decimal, spaces).
 * Duplicated from ocrInvoice.ts so migration is self-contained.
 */
function parseNumFr(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null) return 0;
  const cleaned = String(value)
    .replace(/\s/g, '')
    .replace(/,/g, '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * One-time migration: re-parse invoice item prices that were stored as 0
 * due to French-formatted numbers (comma decimals). Then rebuild the
 * price history cadencier from the corrected data.
 */
export async function runPriceRepairMigration(): Promise<'skipped' | 'done'> {
  const current = localStorage.getItem(STORAGE_KEYS.priceRepairMigrationVersion);
  if (current === MIGRATION_VERSION) return 'skipped';

  const invoices = await db.invoices.toArray();
  let repaired = 0;

  for (const invoice of invoices) {
    let changed = false;

    const fixedItems = invoice.items.map((item) => {
      const originalUnitPrice = item.unitPriceHT;
      const originalTotalPrice = item.totalPriceHT;

      // Re-parse from stored values (they may already be numbers, but some
      // could have been stored as 0 when the original string had a comma)
      let unitPriceHT = parseNumFr(item.unitPriceHT);
      let totalPriceHT = parseNumFr(item.totalPriceHT);
      const quantity = parseNumFr(item.quantity) || 1;

      // Fallback: compute missing price from the other
      if (unitPriceHT <= 0 && totalPriceHT > 0 && quantity > 0) {
        unitPriceHT = Math.round((totalPriceHT / quantity) * 100) / 100;
      } else if (totalPriceHT <= 0 && unitPriceHT > 0 && quantity > 0) {
        totalPriceHT = Math.round(unitPriceHT * quantity * 100) / 100;
      }

      if (unitPriceHT !== originalUnitPrice || totalPriceHT !== originalTotalPrice) {
        changed = true;
      }

      return { ...item, unitPriceHT, totalPriceHT, quantity };
    });

    if (changed) {
      await db.invoices.update(invoice.id, { items: fixedItems });
      repaired++;
    }
  }

  // Rebuild price history from corrected invoice data
  try {
    await useAppStore.getState().rebuildPriceHistory();
  } catch (err) {
    logger.warn('Price repair: rebuildPriceHistory failed', { err });
  }

  localStorage.setItem(STORAGE_KEYS.priceRepairMigrationVersion, MIGRATION_VERSION);
  logger.info(`Price repair migration: ${repaired} invoice(s) fixed, cadencier rebuilt`);
  return 'done';
}
