import type { StateCreator } from 'zustand';
import { db } from '../../services/db';
import {
  deleteRemoteProduct,
  fetchRemoteLatestProductByBarcode,
  fetchRemoteProducts,
  upsertRemoteProduct,
} from '../../services/cloudSync';
import { sanitize } from '../../utils';
import type { AppState } from '../appStore';
import { runCloudRead, runCloudTask } from './cloudUtils';
import { sanitizeAllergens } from './sliceUtils';

type ProductSlice = Pick<
  AppState,
  'getProducts' | 'getLatestProductByBarcode' | 'addProduct' | 'updateProduct' | 'markProductAsUsed' | 'deleteProduct'
>;

export const createProductSlice: StateCreator<AppState, [], [], ProductSlice> = () => ({
  getProducts: async (options) => {
    const limit = options?.limit;
    const offset = options?.offset ?? 0;

    const remoteProducts = await runCloudRead('products:list', async () => fetchRemoteProducts(limit, offset));
    if (remoteProducts) {
      if (offset === 0) {
        const fullRemote = await runCloudRead('products:list:full', async () => fetchRemoteProducts());
        if (fullRemote) {
          const remoteIds = new Set(fullRemote.map((p) => p.id));
          const localOnly = await db.productTraces
            .filter((p) => !remoteIds.has(p.id))
            .toArray();
          await db.productTraces.clear();
          await db.productTraces.bulkPut([...fullRemote, ...localOnly]);
        }
      }
      if (remoteProducts.length === 0) {
        const localAll = await db.productTraces.orderBy('scannedAt').reverse().toArray();
        if (localAll.length > 0) {
          await runCloudTask('products:seed', async () => {
            for (const item of localAll) await upsertRemoteProduct(item);
          });
          let seededQuery = db.productTraces.orderBy('scannedAt').reverse();
          if (offset > 0) seededQuery = seededQuery.offset(offset);
          if (typeof limit === 'number') seededQuery = seededQuery.limit(limit);
          return seededQuery.toArray();
        }
      }
      return remoteProducts;
    }

    let localQuery = db.productTraces.orderBy('scannedAt').reverse();
    if (offset > 0) localQuery = localQuery.offset(offset);
    if (typeof limit === 'number') localQuery = localQuery.limit(limit);
    return localQuery.toArray();
  },

  getLatestProductByBarcode: async (barcode) => {
    const sanitizedBarcode = sanitize(barcode).trim();
    if (!sanitizedBarcode) return null;

    const remoteProduct = await runCloudRead('products:latestByBarcode', async () =>
      fetchRemoteLatestProductByBarcode(sanitizedBarcode),
    );
    if (remoteProduct) return remoteProduct;

    const matches = await db.productTraces
      .where('barcode')
      .equals(sanitizedBarcode)
      .reverse()
      .limit(1)
      .toArray();
    return matches[0] ?? null;
  },

  addProduct: async (product) => {
    const status = product.status ?? 'active';
    const payload = {
      ...product,
      status,
      usedAt: status === 'used' ? product.usedAt ?? new Date() : undefined,
      productName: sanitize(product.productName),
      supplier: sanitize(product.supplier),
      lotNumber: sanitize(product.lotNumber),
      category: sanitize(product.category),
      barcode: product.barcode ? sanitize(product.barcode) : undefined,
      allergens: sanitizeAllergens(product.allergens),
    };
    await db.productTraces.add(payload);
    const remoteSaved = await runCloudRead('products:add', async () => upsertRemoteProduct(payload));
    if (remoteSaved) {
      await db.productTraces.put(remoteSaved);
    }
  },

  updateProduct: async (product) => {
    const status = product.status ?? 'active';
    const payload = {
      ...product,
      status,
      usedAt: status === 'used' ? product.usedAt ?? new Date() : undefined,
      productName: sanitize(product.productName),
      supplier: sanitize(product.supplier),
      lotNumber: sanitize(product.lotNumber),
      category: sanitize(product.category),
      barcode: product.barcode ? sanitize(product.barcode) : undefined,
      allergens: sanitizeAllergens(product.allergens),
    };
    await db.productTraces.put(payload);
    const remoteSaved = await runCloudRead('products:update', async () => upsertRemoteProduct(payload));
    if (remoteSaved) {
      await db.productTraces.put(remoteSaved);
    }
  },

  markProductAsUsed: async (id) => {
    const current = await db.productTraces.get(id);
    if (!current || current.status === 'used') return;

    const payload = {
      ...current,
      status: 'used' as const,
      usedAt: new Date(),
    };
    await db.productTraces.put(payload);

    const remoteSaved = await runCloudRead('products:markAsUsed', async () => upsertRemoteProduct(payload));
    if (remoteSaved) {
      await db.productTraces.put(remoteSaved);
    }
  },

  deleteProduct: async (id) => {
    await db.productTraces.delete(id);
    await runCloudTask('products:delete', async () => {
      await deleteRemoteProduct(id);
    });
  },
});
