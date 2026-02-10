import type { StateCreator } from 'zustand';
import { db } from '../../services/db';
import {
  deleteRemoteInvoice,
  fetchRemoteInvoices,
  fetchRemotePriceHistory,
  replaceRemotePriceHistory,
  upsertRemoteInvoice,
} from '../../services/cloudSync';
import { sanitize } from '../../utils';
import type { AppState } from '../appStore';
import { runCloudRead, runCloudTask } from './cloudUtils';
import { buildPriceKey, compressInvoiceImages } from './sliceUtils';
import type { Invoice, PriceHistory } from '../../types';

type InvoiceSlice = Pick<
  AppState,
  | 'getInvoices'
  | 'addInvoice'
  | 'updateInvoice'
  | 'deleteInvoice'
  | 'updatePriceHistory'
  | 'rebuildPriceHistory'
  | 'getPriceHistory'
  | 'deletePriceHistoryItem'
  | 'clearAllPriceHistory'
>;

function mergeInvoiceMedia(remote: Invoice, local?: Invoice): Invoice {
  if (!local) return remote;
  return {
    ...remote,
    // Keep local blobs until cloud upload has definitely produced stable URLs.
    images: remote.images.length > 0 ? remote.images : local.images,
    imageUrls: remote.imageUrls && remote.imageUrls.length > 0 ? remote.imageUrls : local.imageUrls,
  };
}

export const createInvoiceSlice: StateCreator<AppState, [], [], InvoiceSlice> = () => ({
  getInvoices: async (options) => {
    const limit = options?.limit;
    const offset = options?.offset ?? 0;

    const remoteInvoices = await runCloudRead('invoices:list', async () => fetchRemoteInvoices(limit, offset));
    if (remoteInvoices) {
      let localById: Map<string, Invoice> | null = null;
      let didFullMerge = false;
      if (offset === 0) {
        const fullRemote = await runCloudRead('invoices:list:full', async () => fetchRemoteInvoices());
        if (fullRemote) {
          const localAll = await db.invoices.toArray();
          localById = new Map(localAll.map((item) => [item.id, item]));
          const mergedRemote = fullRemote.map((item) => mergeInvoiceMedia(item, localById?.get(item.id)));
          const remoteIds = new Set(fullRemote.map((item) => item.id));
          const localOnly = localAll.filter((item) => !remoteIds.has(item.id));
          await db.invoices.clear();
          await db.invoices.bulkPut([...mergedRemote, ...localOnly]);
          didFullMerge = true;
        }
      }
      if (remoteInvoices.length === 0) {
        const localAll = await db.invoices.orderBy('scannedAt').reverse().toArray();
        if (localAll.length > 0) {
          await runCloudTask('invoices:seed', async () => {
            for (const item of localAll) await upsertRemoteInvoice(item);
          });
          let seededQuery = db.invoices.orderBy('scannedAt').reverse();
          if (offset > 0) seededQuery = seededQuery.offset(offset);
          if (typeof limit === 'number') seededQuery = seededQuery.limit(limit);
          return seededQuery.toArray();
        }
      }
      if (didFullMerge) {
        let syncedQuery = db.invoices.orderBy('scannedAt').reverse();
        if (offset > 0) syncedQuery = syncedQuery.offset(offset);
        if (typeof limit === 'number') syncedQuery = syncedQuery.limit(limit);
        return syncedQuery.toArray();
      }
      if (!localById) {
        const localMatches = await db.invoices.bulkGet(remoteInvoices.map((item) => item.id));
        return remoteInvoices.map((item, index) => mergeInvoiceMedia(item, localMatches[index] ?? undefined));
      }
      return remoteInvoices.map((item) => mergeInvoiceMedia(item, localById?.get(item.id)));
    }

    let localQuery = db.invoices.orderBy('scannedAt').reverse();
    if (offset > 0) localQuery = localQuery.offset(offset);
    if (typeof limit === 'number') localQuery = localQuery.limit(limit);
    return localQuery.toArray();
  },

  addInvoice: async (invoice) => {
    const compressedImages = await compressInvoiceImages(invoice.images);
    const payload = {
      ...invoice,
      images: compressedImages,
      supplier: sanitize(invoice.supplier),
      invoiceNumber: sanitize(invoice.invoiceNumber),
      ocrText: sanitize(invoice.ocrText),
      tags: invoice.tags.map(sanitize),
      items: invoice.items.map((item) => ({ ...item, designation: sanitize(item.designation) })),
    };
    await db.invoices.add(payload);
    const remoteSaved = await runCloudRead('invoices:add', async () => upsertRemoteInvoice(payload));
    if (remoteSaved) {
      await db.invoices.put(remoteSaved);
    }
  },

  updateInvoice: async (invoice) => {
    const compressedImages = await compressInvoiceImages(invoice.images);
    const payload = {
      ...invoice,
      images: compressedImages,
      supplier: sanitize(invoice.supplier),
      invoiceNumber: sanitize(invoice.invoiceNumber),
      ocrText: sanitize(invoice.ocrText),
      tags: invoice.tags.map(sanitize),
      items: invoice.items.map((item) => ({ ...item, designation: sanitize(item.designation) })),
    };
    await db.invoices.put(payload);
    const remoteSaved = await runCloudRead('invoices:update', async () => upsertRemoteInvoice(payload));
    if (remoteSaved) {
      await db.invoices.put(remoteSaved);
    }
  },

  deleteInvoice: async (id) => {
    await db.invoices.delete(id);
    await runCloudTask('invoices:delete', async () => {
      await deleteRemoteInvoice(id);
    });
  },

  updatePriceHistory: async (invoice) => {
    for (const item of invoice.items) {
      const itemName = sanitize(item.designation).trim();
      const supplier = sanitize(invoice.supplier).trim();
      if (!itemName || !supplier) continue;

      const key = buildPriceKey(itemName, supplier);
      const existing = await db.priceHistory.get(key);

      if (existing) {
        const prices = [...existing.prices, { date: invoice.invoiceDate, price: item.unitPriceHT }];
        const priceValues = prices.map((price) => price.price);
        await db.priceHistory.put({
          ...existing,
          itemName,
          supplier,
          prices,
          averagePrice: Math.round((priceValues.reduce((sum, value) => sum + value, 0) / priceValues.length) * 100) / 100,
          minPrice: Math.min(...priceValues),
          maxPrice: Math.max(...priceValues),
          unit: item.conditioningUnit || existing.unit,
        });
      } else {
        await db.priceHistory.add({
          id: key,
          itemName,
          supplier,
          prices: [{ date: invoice.invoiceDate, price: item.unitPriceHT }],
          averagePrice: item.unitPriceHT,
          minPrice: item.unitPriceHT,
          maxPrice: item.unitPriceHT,
          unit: item.conditioningUnit,
        });
      }
    }
  },

  rebuildPriceHistory: async () => {
    const invoices = await db.invoices.toArray();
    const map = new Map<string, PriceHistory>();

    for (const invoice of invoices) {
      const supplier = invoice.supplier.trim();
      if (!supplier) continue;

      for (const item of invoice.items) {
        const itemName = item.designation.trim();
        if (!itemName) continue;

        const key = buildPriceKey(itemName, supplier);
        const existing = map.get(key) ?? {
          id: key,
          itemName,
          supplier,
          prices: [] as { date: Date; price: number }[],
          averagePrice: 0,
          minPrice: 0,
          maxPrice: 0,
          unit: undefined,
        };
        existing.itemName = itemName;
        existing.supplier = supplier;
        existing.unit = item.conditioningUnit || existing.unit;
        existing.prices.push({ date: invoice.invoiceDate, price: item.unitPriceHT });
        map.set(key, existing);
      }
    }

    const nextEntries = Array.from(map.values())
      .map((entry) => {
        const values = entry.prices.map((price) => price.price);
        if (values.length === 0) return null;
        return {
          ...entry,
          averagePrice: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100,
          minPrice: Math.min(...values),
          maxPrice: Math.max(...values),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    await db.transaction('rw', db.priceHistory, async () => {
      await db.priceHistory.clear();
      if (nextEntries.length > 0) {
        await db.priceHistory.bulkAdd(nextEntries);
      }
    });

    await runCloudTask('price-history:replace', async () => {
      await replaceRemotePriceHistory(nextEntries);
    });
  },

  getPriceHistory: async () => {
    const remoteHistory = await runCloudRead('price-history:list', fetchRemotePriceHistory);
    if (remoteHistory) {
      if (remoteHistory.length > 0) {
        await db.priceHistory.clear();
        await db.priceHistory.bulkPut(remoteHistory);
      } else {
        const localHistory = await db.priceHistory.toArray();
        if (localHistory.length > 0) {
          await runCloudTask('price-history:seed', async () => {
            await replaceRemotePriceHistory(localHistory);
          });
          return localHistory;
        }
      }
      return remoteHistory;
    }
    return db.priceHistory.toArray();
  },

  deletePriceHistoryItem: async (id) => {
    await db.priceHistory.delete(id);
    await runCloudTask('price-history:replace', async () => {
      const remaining = await db.priceHistory.toArray();
      await replaceRemotePriceHistory(remaining);
    });
  },

  clearAllPriceHistory: async () => {
    await db.priceHistory.clear();
    await runCloudTask('price-history:replace', async () => {
      await replaceRemotePriceHistory([]);
    });
  },
});
