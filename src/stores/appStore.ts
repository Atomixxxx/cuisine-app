import { create } from 'zustand';
import { db } from '../services/db';
import { compressImage, sanitize } from '../utils';
import { logger } from '../services/logger';
import {
  deleteRemoteEquipment,
  deleteRemoteIngredient,
  deleteRemoteInvoice,
  deleteRemoteOilChangeRecord,
  deleteRemoteProduct,
  deleteRemoteRecipe,
  deleteRemoteTask,
  fetchRemoteEquipment,
  fetchRemoteIngredients,
  fetchRemoteInvoices,
  fetchRemoteLatestProductByBarcode,
  fetchRemoteOilChangeRecords,
  fetchRemotePriceHistory,
  fetchRemoteProducts,
  fetchRemoteRecipeIngredients,
  fetchRemoteRecipes,
  fetchRemoteSettings,
  fetchRemoteTasks,
  fetchRemoteTemperatureRecords,
  isCloudSyncEnabled,
  replaceRemotePriceHistory,
  replaceRemoteRecipeIngredients,
  upsertRemoteEquipment,
  upsertRemoteIngredient,
  upsertRemoteInvoice,
  upsertRemoteOilChangeRecord,
  upsertRemoteProduct,
  upsertRemoteRecipe,
  upsertRemoteSettings,
  upsertRemoteTask,
  upsertRemoteTemperatureRecord,
} from '../services/cloudSync';
import type {
  AppSettings,
  Equipment,
  TemperatureRecord,
  Task,
  ProductTrace,
  Invoice,
  PriceHistory,
  Ingredient,
  Recipe,
  RecipeIngredient,
  OilChangeRecord,
} from '../types';

interface AppState {
  settings: AppSettings | null;
  equipment: Equipment[];
  darkMode: boolean;
  activeTab: string;

  loadSettings: () => Promise<void>;
  updateSettings: (s: Partial<AppSettings>) => Promise<void>;
  setDarkMode: (v: boolean) => void;
  setActiveTab: (tab: string) => void;

  // Equipment
  loadEquipment: () => Promise<void>;
  addEquipment: (e: Equipment) => Promise<void>;
  updateEquipment: (e: Equipment) => Promise<void>;
  deleteEquipment: (id: string) => Promise<void>;

  // Temperature
  addTemperatureRecord: (r: TemperatureRecord) => Promise<void>;
  getTemperatureRecords: (startDate?: Date, endDate?: Date, equipmentId?: string) => Promise<TemperatureRecord[]>;
  addOilChangeRecord: (r: OilChangeRecord) => Promise<void>;
  removeOilChangeRecord: (id: string) => Promise<void>;
  getOilChangeRecords: (startDate?: Date, endDate?: Date, fryerId?: string) => Promise<OilChangeRecord[]>;

  // Tasks
  getTasks: (includeArchived?: boolean) => Promise<Task[]>;
  addTask: (t: Task) => Promise<void>;
  updateTask: (t: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  // Products
  getProducts: (options?: { limit?: number; offset?: number }) => Promise<ProductTrace[]>;
  getLatestProductByBarcode: (barcode: string) => Promise<ProductTrace | null>;
  addProduct: (p: ProductTrace) => Promise<void>;
  updateProduct: (p: ProductTrace) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // Invoices
  getInvoices: (options?: { limit?: number; offset?: number }) => Promise<Invoice[]>;
  addInvoice: (i: Invoice) => Promise<void>;
  updateInvoice: (i: Invoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;

  // Ingredients
  getIngredients: () => Promise<Ingredient[]>;
  addIngredient: (i: Ingredient) => Promise<void>;
  updateIngredient: (i: Ingredient) => Promise<void>;
  deleteIngredient: (id: string) => Promise<void>;

  // Recipes
  getRecipes: () => Promise<Recipe[]>;
  getRecipeIngredients: (recipeId: string) => Promise<RecipeIngredient[]>;
  saveRecipeWithIngredients: (recipe: Recipe, lines: RecipeIngredient[]) => Promise<void>;
  deleteRecipe: (recipeId: string) => Promise<void>;

  // Recurring tasks
  processRecurringTasks: () => Promise<void>;

  // Price history
  updatePriceHistory: (invoice: Invoice) => Promise<void>;
  rebuildPriceHistory: () => Promise<void>;
  getPriceHistory: () => Promise<PriceHistory[]>;
}

const normalizeKeyPart = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const buildPriceKey = (itemName: string, supplier: string): string =>
  `${normalizeKeyPart(itemName)}_${normalizeKeyPart(supplier)}`;

const sanitizeAllergens = (allergens?: string[]): string[] | undefined => {
  if (!allergens || allergens.length === 0) return undefined;
  const deduplicated = Array.from(
    new Set(
      allergens
        .map((allergen) => sanitize(allergen).trim())
        .filter(Boolean),
    ),
  );
  return deduplicated.length > 0 ? deduplicated : undefined;
};

const INVOICE_IMAGE_COMPRESSION_THRESHOLD_BYTES = 350 * 1024;
const INVOICE_IMAGE_MAX_WIDTH = 1600;
const INVOICE_IMAGE_QUALITY = 0.82;

const compressInvoiceImages = async (images: Blob[]): Promise<Blob[]> => {
  if (images.length === 0) return [];
  return Promise.all(
    images.map(async (image) => {
      if (image.size < INVOICE_IMAGE_COMPRESSION_THRESHOLD_BYTES) return image;
      return compressImage(image, INVOICE_IMAGE_MAX_WIDTH, INVOICE_IMAGE_QUALITY);
    }),
  );
};

const CLOUD_SYNC_ENABLED = isCloudSyncEnabled();

function isCloudSyncActive(): boolean {
  return CLOUD_SYNC_ENABLED;
}

async function runCloudTask(taskName: string, fn: () => Promise<void>): Promise<boolean> {
  if (!isCloudSyncActive()) return false;
  try {
    await fn();
    return true;
  } catch (error) {
    logger.warn(`cloud sync failed: ${taskName}`, { error });
    return false;
  }
}

async function runCloudRead<T>(taskName: string, fn: () => Promise<T>): Promise<T | null> {
  if (!isCloudSyncActive()) return null;
  try {
    return await fn();
  } catch (error) {
    logger.warn(`cloud read failed: ${taskName}`, { error });
    return null;
  }
}

export const useAppStore = create<AppState>((set, _get) => ({
  settings: null,
  equipment: [],
  darkMode: true,
  activeTab: 'temperature',

  loadSettings: async () => {
    let settings = await db.settings.get('default');

    const remoteSettings = await runCloudRead('settings:list', fetchRemoteSettings);
    if (remoteSettings && remoteSettings.length > 0) {
      settings = remoteSettings.find((entry) => entry.id === 'default') ?? remoteSettings[0];
      await db.settings.clear();
      await db.settings.bulkPut(remoteSettings);
    } else if (remoteSettings && settings) {
      const localSettings = settings;
      await runCloudTask('settings:seed', async () => {
        await upsertRemoteSettings(localSettings);
      });
    }

    if (settings) {
      set({ settings, darkMode: settings.darkMode });
      if (settings.darkMode) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      return;
    }

    document.documentElement.classList.add('dark');
  },

  updateSettings: async (partial) => {
    const current = await db.settings.get('default');
    if (current) {
      const updated = { ...current, ...partial };
      await db.settings.put(updated);
      await runCloudTask('settings:upsert', async () => {
        await upsertRemoteSettings(updated);
      });
      set({ settings: updated });
      if (partial.darkMode !== undefined) {
        set({ darkMode: partial.darkMode });
        if (partial.darkMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
      }
    }
  },

  setDarkMode: (v) => {
    if (v) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    set((state) => ({
      darkMode: v,
      settings: state.settings ? { ...state.settings, darkMode: v } : state.settings,
    }));
    void db.settings.update('default', { darkMode: v });
    void runCloudTask('settings:darkMode', async () => {
      const current = await db.settings.get('default');
      if (current) await upsertRemoteSettings({ ...current, darkMode: v });
    });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadEquipment: async () => {
    const localList = await db.equipment.orderBy('order').toArray();
    const remoteList = await runCloudRead('equipment:list', fetchRemoteEquipment);

    if (remoteList && remoteList.length > 0) {
      await db.equipment.clear();
      await db.equipment.bulkPut(remoteList);
      set({ equipment: remoteList });
      return;
    }

    if (remoteList && localList.length > 0) {
      await runCloudTask('equipment:seed', async () => {
        for (const item of localList) await upsertRemoteEquipment(item);
      });
    }

    set({ equipment: localList });
  },

  addEquipment: async (e) => {
    const sanitized = { ...e, name: sanitize(e.name) };
    await db.equipment.add(sanitized);
    await runCloudTask('equipment:add', async () => {
      await upsertRemoteEquipment(sanitized);
    });
    set((state) => ({
      equipment: [...state.equipment, sanitized].sort((a, b) => a.order - b.order),
    }));
  },

  updateEquipment: async (e) => {
    const sanitized = { ...e, name: sanitize(e.name) };
    await db.equipment.put(sanitized);
    await runCloudTask('equipment:update', async () => {
      await upsertRemoteEquipment(sanitized);
    });
    set((state) => ({
      equipment: state.equipment
        .map((item) => (item.id === sanitized.id ? sanitized : item))
        .sort((a, b) => a.order - b.order),
    }));
  },

  deleteEquipment: async (id) => {
    await db.equipment.delete(id);
    await runCloudTask('equipment:delete', async () => {
      await deleteRemoteEquipment(id);
    });
    set((state) => ({
      equipment: state.equipment.filter((item) => item.id !== id),
    }));
  },

  addTemperatureRecord: async (r) => {
    await db.temperatureRecords.add(r);
    await runCloudTask('temperature:add', async () => {
      await upsertRemoteTemperatureRecord(r);
    });
  },

  getTemperatureRecords: async (startDate, endDate, equipmentId) => {
    const remoteRecords = await runCloudRead('temperature:list', async () =>
      fetchRemoteTemperatureRecords({ startDate, endDate, equipmentId }),
    );
    if (remoteRecords) {
      if (remoteRecords.length > 0) {
        return remoteRecords;
      }
      const localAll = await db.temperatureRecords.toArray();
      if (localAll.length > 0) {
        await runCloudTask('temperature:seed', async () => {
          for (const item of localAll) await upsertRemoteTemperatureRecord(item);
        });
      }
      return remoteRecords;
    }

    const hasDateFilter = Boolean(startDate || endDate);
    const minDate = startDate ?? new Date(0);
    const maxDate = endDate ?? new Date(8640000000000000);

    if (equipmentId && hasDateFilter) {
      return db.temperatureRecords
        .where('[equipmentId+timestamp]')
        .between([equipmentId, minDate], [equipmentId, maxDate], true, true)
        .reverse()
        .toArray();
    }

    if (hasDateFilter) {
      return db.temperatureRecords
        .where('timestamp')
        .between(minDate, maxDate, true, true)
        .reverse()
        .toArray();
    }

    if (equipmentId) {
      const records = await db.temperatureRecords.where('equipmentId').equals(equipmentId).toArray();
      return records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }

    return db.temperatureRecords.orderBy('timestamp').reverse().toArray();
  },

  addOilChangeRecord: async (r) => {
    await db.oilChangeRecords.add(r);
    await runCloudTask('oil-change:add', async () => {
      await upsertRemoteOilChangeRecord(r);
    });
  },

  removeOilChangeRecord: async (id) => {
    await db.oilChangeRecords.delete(id);
    await runCloudTask('oil-change:delete', async () => {
      await deleteRemoteOilChangeRecord(id);
    });
  },

  getOilChangeRecords: async (startDate, endDate, fryerId) => {
    const remoteRecords = await runCloudRead('oil-change:list', async () =>
      fetchRemoteOilChangeRecords({ startDate, endDate, fryerId }),
    );
    if (remoteRecords) {
      if (remoteRecords.length > 0) {
        return remoteRecords;
      }
      const localAll = await db.oilChangeRecords.toArray();
      if (localAll.length > 0) {
        await runCloudTask('oil-change:seed', async () => {
          for (const item of localAll) await upsertRemoteOilChangeRecord(item);
        });
      }
      return remoteRecords;
    }

    const hasDateFilter = Boolean(startDate || endDate);
    const minDate = startDate ?? new Date(0);
    const maxDate = endDate ?? new Date(8640000000000000);

    if (fryerId && hasDateFilter) {
      return db.oilChangeRecords
        .where('[fryerId+changedAt]')
        .between([fryerId, minDate], [fryerId, maxDate], true, true)
        .reverse()
        .toArray();
    }

    if (hasDateFilter) {
      return db.oilChangeRecords
        .where('changedAt')
        .between(minDate, maxDate, true, true)
        .reverse()
        .toArray();
    }

    if (fryerId) {
      const records = await db.oilChangeRecords.where('fryerId').equals(fryerId).toArray();
      return records.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
    }

    return db.oilChangeRecords.orderBy('changedAt').reverse().toArray();
  },

  getTasks: async (includeArchived = false) => {
    const remoteTasks = await runCloudRead('tasks:list', fetchRemoteTasks);
    if (remoteTasks) {
      if (remoteTasks.length > 0) {
        await db.tasks.clear();
        await db.tasks.bulkPut(remoteTasks);
      } else {
        const localTasks = await db.tasks.orderBy('order').toArray();
        if (localTasks.length > 0) {
          await runCloudTask('tasks:seed', async () => {
            for (const item of localTasks) await upsertRemoteTask(item);
          });
          if (includeArchived) return localTasks;
          return localTasks.filter((item) => !item.archived);
        }
      }
      if (includeArchived) return remoteTasks;
      return remoteTasks.filter((item) => !item.archived);
    }

    const localTasks = await db.tasks.orderBy('order').toArray();
    if (includeArchived) return localTasks;
    return localTasks.filter((item) => !item.archived);
  },

  addTask: async (t) => {
    const payload = {
      ...t,
      title: sanitize(t.title),
      notes: t.notes ? sanitize(t.notes) : undefined,
    };
    await db.tasks.add(payload);
    await runCloudTask('tasks:add', async () => {
      await upsertRemoteTask(payload);
    });
  },

  updateTask: async (t) => {
    const payload = {
      ...t,
      title: sanitize(t.title),
      notes: t.notes ? sanitize(t.notes) : undefined,
    };
    await db.tasks.put(payload);
    await runCloudTask('tasks:update', async () => {
      await upsertRemoteTask(payload);
    });
  },

  deleteTask: async (id) => {
    await db.tasks.delete(id);
    await runCloudTask('tasks:delete', async () => {
      await deleteRemoteTask(id);
    });
  },

  processRecurringTasks: async () => {
    const all = await db.tasks.toArray();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const task of all) {
      if (!task.recurring || !task.completed || !task.archived || !task.completedAt) continue;

      const completedAt = new Date(task.completedAt);
      const completedDate = new Date(completedAt.getFullYear(), completedAt.getMonth(), completedAt.getDate());
      const daysSinceCompleted = Math.round((startOfToday.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24));

      const shouldRecreate =
        (task.recurring === 'daily' && daysSinceCompleted >= 1) ||
        (task.recurring === 'weekly' && daysSinceCompleted >= 7);

      if (!shouldRecreate) continue;

      // Check if an active copy already exists for today
      const existingActive = all.find(
        t => t.title === task.title && t.category === task.category && !t.archived && !t.completed
      );
      if (existingActive) continue;

      const count = await db.tasks.count();
      const recreatedTask = {
        id: crypto.randomUUID(),
        title: sanitize(task.title),
        category: task.category,
        priority: task.priority,
        estimatedTime: task.estimatedTime,
        notes: task.notes ? sanitize(task.notes) : undefined,
        recurring: task.recurring,
        completed: false,
        archived: false,
        createdAt: now,
        order: count,
      };
      await db.tasks.add(recreatedTask);
      await runCloudTask('tasks:recurring-recreate', async () => {
        await upsertRemoteTask(recreatedTask);
      });
    }
  },

  getProducts: async (options) => {
    const limit = options?.limit;
    const offset = options?.offset ?? 0;

    const remoteProducts = await runCloudRead('products:list', async () => fetchRemoteProducts(limit, offset));
    if (remoteProducts) {
      if (offset === 0) {
        const fullRemote = await runCloudRead('products:list:full', async () => fetchRemoteProducts());
        if (fullRemote) {
          await db.productTraces.clear();
          await db.productTraces.bulkPut(fullRemote);
        }
      }
      if (remoteProducts.length === 0) {
        const localAll = await db.productTraces.orderBy('scannedAt').reverse().toArray();
        if (localAll.length > 0) {
          await runCloudTask('products:seed', async () => {
            for (const item of localAll) {
              await upsertRemoteProduct(item);
            }
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

  addProduct: async (p) => {
    const payload = {
      ...p,
      productName: sanitize(p.productName),
      supplier: sanitize(p.supplier),
      lotNumber: sanitize(p.lotNumber),
      category: sanitize(p.category),
      barcode: p.barcode ? sanitize(p.barcode) : undefined,
      allergens: sanitizeAllergens(p.allergens),
    };
    await db.productTraces.add(payload);
    const remoteSaved = await runCloudRead('products:add', async () => upsertRemoteProduct(payload));
    if (remoteSaved) {
      await db.productTraces.put(remoteSaved);
    }
  },

  updateProduct: async (p) => {
    const payload = {
      ...p,
      productName: sanitize(p.productName),
      supplier: sanitize(p.supplier),
      lotNumber: sanitize(p.lotNumber),
      category: sanitize(p.category),
      barcode: p.barcode ? sanitize(p.barcode) : undefined,
      allergens: sanitizeAllergens(p.allergens),
    };
    await db.productTraces.put(payload);
    const remoteSaved = await runCloudRead('products:update', async () => upsertRemoteProduct(payload));
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

  getInvoices: async (options) => {
    const limit = options?.limit;
    const offset = options?.offset ?? 0;

    const remoteInvoices = await runCloudRead('invoices:list', async () => fetchRemoteInvoices(limit, offset));
    if (remoteInvoices) {
      if (offset === 0) {
        const fullRemote = await runCloudRead('invoices:list:full', async () => fetchRemoteInvoices());
        if (fullRemote) {
          await db.invoices.clear();
          await db.invoices.bulkPut(fullRemote);
        }
      }
      if (remoteInvoices.length === 0) {
        const localAll = await db.invoices.orderBy('scannedAt').reverse().toArray();
        if (localAll.length > 0) {
          await runCloudTask('invoices:seed', async () => {
            for (const item of localAll) {
              await upsertRemoteInvoice(item);
            }
          });
          let seededQuery = db.invoices.orderBy('scannedAt').reverse();
          if (offset > 0) seededQuery = seededQuery.offset(offset);
          if (typeof limit === 'number') seededQuery = seededQuery.limit(limit);
          return seededQuery.toArray();
        }
      }
      return remoteInvoices;
    }

    let localQuery = db.invoices.orderBy('scannedAt').reverse();
    if (offset > 0) localQuery = localQuery.offset(offset);
    if (typeof limit === 'number') localQuery = localQuery.limit(limit);
    return localQuery.toArray();
  },

  addInvoice: async (i) => {
    const compressedImages = await compressInvoiceImages(i.images);
    const payload = {
      ...i,
      images: compressedImages,
      supplier: sanitize(i.supplier),
      invoiceNumber: sanitize(i.invoiceNumber),
      ocrText: sanitize(i.ocrText),
      tags: i.tags.map(sanitize),
      items: i.items.map(item => ({ ...item, designation: sanitize(item.designation) })),
    };
    await db.invoices.add(payload);
    const remoteSaved = await runCloudRead('invoices:add', async () => upsertRemoteInvoice(payload));
    if (remoteSaved) {
      await db.invoices.put(remoteSaved);
    }
  },

  updateInvoice: async (i) => {
    const compressedImages = await compressInvoiceImages(i.images);
    const payload = {
      ...i,
      images: compressedImages,
      supplier: sanitize(i.supplier),
      invoiceNumber: sanitize(i.invoiceNumber),
      ocrText: sanitize(i.ocrText),
      tags: i.tags.map(sanitize),
      items: i.items.map(item => ({ ...item, designation: sanitize(item.designation) })),
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

  getIngredients: async () => {
    const remoteIngredients = await runCloudRead('ingredients:list', fetchRemoteIngredients);
    if (remoteIngredients) {
      if (remoteIngredients.length > 0) {
        await db.ingredients.clear();
        await db.ingredients.bulkPut(remoteIngredients);
      } else {
        const localIngredients = await db.ingredients.orderBy('name').toArray();
        if (localIngredients.length > 0) {
          await runCloudTask('ingredients:seed', async () => {
            for (const item of localIngredients) await upsertRemoteIngredient(item);
          });
          return localIngredients;
        }
      }
      return remoteIngredients;
    }

    return db.ingredients.orderBy('name').toArray();
  },

  addIngredient: async (ingredient) => {
    const payload = {
      ...ingredient,
      name: sanitize(ingredient.name),
      supplierId: ingredient.supplierId ? sanitize(ingredient.supplierId) : undefined,
    };
    await db.ingredients.add(payload);
    await runCloudTask('ingredients:add', async () => {
      await upsertRemoteIngredient(payload);
    });
  },

  updateIngredient: async (ingredient) => {
    const payload = {
      ...ingredient,
      name: sanitize(ingredient.name),
      supplierId: ingredient.supplierId ? sanitize(ingredient.supplierId) : undefined,
    };
    await db.ingredients.put(payload);
    await runCloudTask('ingredients:update', async () => {
      await upsertRemoteIngredient(payload);
    });
  },

  deleteIngredient: async (id) => {
    await db.ingredients.delete(id);
    await db.recipeIngredients.where('ingredientId').equals(id).delete();
    await runCloudTask('ingredients:delete', async () => {
      await deleteRemoteIngredient(id);
    });
  },

  getRecipes: async () => {
    const remoteRecipes = await runCloudRead('recipes:list', fetchRemoteRecipes);
    if (remoteRecipes) {
      if (remoteRecipes.length > 0) {
        await db.recipes.clear();
        await db.recipes.bulkPut(remoteRecipes);
      } else {
        const localRecipes = await db.recipes.orderBy('updatedAt').reverse().toArray();
        if (localRecipes.length > 0) {
          await runCloudTask('recipes:seed', async () => {
            for (const recipe of localRecipes) await upsertRemoteRecipe(recipe);
          });
          return localRecipes;
        }
      }
      return remoteRecipes;
    }
    return db.recipes.orderBy('updatedAt').reverse().toArray();
  },

  getRecipeIngredients: async (recipeId) => {
    const remoteLines = await runCloudRead('recipe-ingredients:list', async () =>
      fetchRemoteRecipeIngredients(recipeId),
    );
    if (remoteLines) {
      if (remoteLines.length === 0) {
        const localLines = await db.recipeIngredients.where('recipeId').equals(recipeId).toArray();
        if (localLines.length > 0) {
          await runCloudTask('recipe-ingredients:seed', async () => {
            await replaceRemoteRecipeIngredients(recipeId, localLines);
          });
          return localLines;
        }
      }
      await db.recipeIngredients.where('recipeId').equals(recipeId).delete();
      if (remoteLines.length > 0) await db.recipeIngredients.bulkPut(remoteLines);
      return remoteLines;
    }

    return db.recipeIngredients.where('recipeId').equals(recipeId).toArray();
  },

  saveRecipeWithIngredients: async (recipe, lines) => {
    const sanitizedRecipe = {
      ...recipe,
      title: sanitize(recipe.title),
      allergens: sanitizeAllergens(recipe.allergens),
    };
    const sanitizedLines = lines.map((line) => ({
      ...line,
      requiredQuantity: Math.max(0, line.requiredQuantity),
    }));

    await db.transaction('rw', db.recipes, db.recipeIngredients, async () => {
      await db.recipes.put(sanitizedRecipe);

      await db.recipeIngredients.where('recipeId').equals(sanitizedRecipe.id).delete();
      if (sanitizedLines.length > 0) {
        await db.recipeIngredients.bulkAdd(sanitizedLines);
      }
    });

    await runCloudTask('recipes:save', async () => {
      await upsertRemoteRecipe(sanitizedRecipe);
      await replaceRemoteRecipeIngredients(sanitizedRecipe.id, sanitizedLines);
    });
  },

  deleteRecipe: async (recipeId) => {
    await db.transaction('rw', db.recipes, db.recipeIngredients, async () => {
      await db.recipes.delete(recipeId);
      await db.recipeIngredients.where('recipeId').equals(recipeId).delete();
    });
    await runCloudTask('recipes:delete', async () => {
      await deleteRemoteRecipe(recipeId);
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
        const priceValues = prices.map(p => p.price);
        await db.priceHistory.put({
          ...existing,
          itemName,
          supplier,
          prices,
          averagePrice: Math.round((priceValues.reduce((s, p) => s + p, 0) / priceValues.length) * 100) / 100,
          minPrice: Math.min(...priceValues),
          maxPrice: Math.max(...priceValues),
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
          prices: [],
          averagePrice: 0,
          minPrice: 0,
          maxPrice: 0,
        };
        existing.itemName = itemName;
        existing.supplier = supplier;
        existing.prices.push({ date: invoice.invoiceDate, price: item.unitPriceHT });
        map.set(key, existing);
      }
    }

    const nextEntries: PriceHistory[] = [];
    for (const entry of map.values()) {
      const priceValues = entry.prices.map(p => p.price);
      if (priceValues.length === 0) continue;
      nextEntries.push({
        ...entry,
        averagePrice: Math.round((priceValues.reduce((s, p) => s + p, 0) / priceValues.length) * 100) / 100,
        minPrice: Math.min(...priceValues),
        maxPrice: Math.max(...priceValues),
      });
    }

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
}));
