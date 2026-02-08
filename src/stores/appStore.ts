import { create } from 'zustand';
import { db } from '../services/db';
import { compressImage, sanitize } from '../utils';
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

export const useAppStore = create<AppState>((set, _get) => ({
  settings: null,
  equipment: [],
  darkMode: false,
  activeTab: 'temperature',

  loadSettings: async () => {
    const s = await db.settings.get('default');
    if (s) {
      set({ settings: s, darkMode: s.darkMode });
      if (s.darkMode) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
  },

  updateSettings: async (partial) => {
    const current = await db.settings.get('default');
    if (current) {
      const updated = { ...current, ...partial };
      await db.settings.put(updated);
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
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadEquipment: async () => {
    const list = await db.equipment.orderBy('order').toArray();
    set({ equipment: list });
  },

  addEquipment: async (e) => {
    const sanitized = { ...e, name: sanitize(e.name) };
    await db.equipment.add(sanitized);
    set((state) => ({
      equipment: [...state.equipment, sanitized].sort((a, b) => a.order - b.order),
    }));
  },

  updateEquipment: async (e) => {
    const sanitized = { ...e, name: sanitize(e.name) };
    await db.equipment.put(sanitized);
    set((state) => ({
      equipment: state.equipment
        .map((item) => (item.id === sanitized.id ? sanitized : item))
        .sort((a, b) => a.order - b.order),
    }));
  },

  deleteEquipment: async (id) => {
    await db.equipment.delete(id);
    set((state) => ({
      equipment: state.equipment.filter((item) => item.id !== id),
    }));
  },

  addTemperatureRecord: async (r) => {
    await db.temperatureRecords.add(r);
  },

  getTemperatureRecords: async (startDate, endDate, equipmentId) => {
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
  },

  removeOilChangeRecord: async (id) => {
    await db.oilChangeRecords.delete(id);
  },

  getOilChangeRecords: async (startDate, endDate, fryerId) => {
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
    const all = await db.tasks.orderBy('order').toArray();
    if (includeArchived) return all;
    return all.filter(t => !t.archived);
  },

  addTask: async (t) => {
    await db.tasks.add({
      ...t,
      title: sanitize(t.title),
      notes: t.notes ? sanitize(t.notes) : undefined,
    });
  },

  updateTask: async (t) => {
    await db.tasks.put({
      ...t,
      title: sanitize(t.title),
      notes: t.notes ? sanitize(t.notes) : undefined,
    });
  },

  deleteTask: async (id) => {
    await db.tasks.delete(id);
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
      await db.tasks.add({
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
      });
    }
  },

  getProducts: async (options) => {
    const limit = options?.limit;
    const offset = options?.offset ?? 0;
    let query = db.productTraces.orderBy('scannedAt').reverse();
    if (offset > 0) query = query.offset(offset);
    if (typeof limit === 'number') query = query.limit(limit);
    return query.toArray();
  },

  getLatestProductByBarcode: async (barcode) => {
    const sanitizedBarcode = sanitize(barcode).trim();
    if (!sanitizedBarcode) return null;
    const matches = await db.productTraces
      .where('barcode')
      .equals(sanitizedBarcode)
      .reverse()
      .limit(1)
      .toArray();
    return matches[0] ?? null;
  },

  addProduct: async (p) => {
    await db.productTraces.add({
      ...p,
      productName: sanitize(p.productName),
      supplier: sanitize(p.supplier),
      lotNumber: sanitize(p.lotNumber),
      category: sanitize(p.category),
      barcode: p.barcode ? sanitize(p.barcode) : undefined,
      allergens: sanitizeAllergens(p.allergens),
    });
  },

  updateProduct: async (p) => {
    await db.productTraces.put({
      ...p,
      productName: sanitize(p.productName),
      supplier: sanitize(p.supplier),
      lotNumber: sanitize(p.lotNumber),
      category: sanitize(p.category),
      barcode: p.barcode ? sanitize(p.barcode) : undefined,
      allergens: sanitizeAllergens(p.allergens),
    });
  },

  deleteProduct: async (id) => {
    await db.productTraces.delete(id);
  },

  getInvoices: async (options) => {
    const limit = options?.limit;
    const offset = options?.offset ?? 0;
    let query = db.invoices.orderBy('scannedAt').reverse();
    if (offset > 0) query = query.offset(offset);
    if (typeof limit === 'number') query = query.limit(limit);
    return query.toArray();
  },

  addInvoice: async (i) => {
    const compressedImages = await compressInvoiceImages(i.images);
    await db.invoices.add({
      ...i,
      images: compressedImages,
      supplier: sanitize(i.supplier),
      invoiceNumber: sanitize(i.invoiceNumber),
      ocrText: sanitize(i.ocrText),
      tags: i.tags.map(sanitize),
      items: i.items.map(item => ({ ...item, designation: sanitize(item.designation) })),
    });
  },

  updateInvoice: async (i) => {
    const compressedImages = await compressInvoiceImages(i.images);
    await db.invoices.put({
      ...i,
      images: compressedImages,
      supplier: sanitize(i.supplier),
      invoiceNumber: sanitize(i.invoiceNumber),
      ocrText: sanitize(i.ocrText),
      tags: i.tags.map(sanitize),
      items: i.items.map(item => ({ ...item, designation: sanitize(item.designation) })),
    });
  },

  deleteInvoice: async (id) => {
    await db.invoices.delete(id);
  },

  getIngredients: async () => {
    return db.ingredients.orderBy('name').toArray();
  },

  addIngredient: async (ingredient) => {
    await db.ingredients.add({
      ...ingredient,
      name: sanitize(ingredient.name),
      supplierId: ingredient.supplierId ? sanitize(ingredient.supplierId) : undefined,
    });
  },

  updateIngredient: async (ingredient) => {
    await db.ingredients.put({
      ...ingredient,
      name: sanitize(ingredient.name),
      supplierId: ingredient.supplierId ? sanitize(ingredient.supplierId) : undefined,
    });
  },

  deleteIngredient: async (id) => {
    await db.ingredients.delete(id);
    await db.recipeIngredients.where('ingredientId').equals(id).delete();
  },

  getRecipes: async () => {
    return db.recipes.orderBy('updatedAt').reverse().toArray();
  },

  getRecipeIngredients: async (recipeId) => {
    return db.recipeIngredients.where('recipeId').equals(recipeId).toArray();
  },

  saveRecipeWithIngredients: async (recipe, lines) => {
    await db.transaction('rw', db.recipes, db.recipeIngredients, async () => {
      await db.recipes.put({
        ...recipe,
        title: sanitize(recipe.title),
        allergens: sanitizeAllergens(recipe.allergens),
      });

      await db.recipeIngredients.where('recipeId').equals(recipe.id).delete();
      if (lines.length > 0) {
        await db.recipeIngredients.bulkAdd(
          lines.map((line) => ({
            ...line,
            requiredQuantity: Math.max(0, line.requiredQuantity),
          })),
        );
      }
    });
  },

  deleteRecipe: async (recipeId) => {
    await db.transaction('rw', db.recipes, db.recipeIngredients, async () => {
      await db.recipes.delete(recipeId);
      await db.recipeIngredients.where('recipeId').equals(recipeId).delete();
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
  },

  getPriceHistory: async () => {
    return db.priceHistory.toArray();
  },
}));
