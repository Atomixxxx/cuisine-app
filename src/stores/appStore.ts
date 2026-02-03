import { create } from 'zustand';
import { db } from '../services/db';
import { sanitize } from '../utils';
import type { AppSettings, Equipment, TemperatureRecord, Task, ProductTrace, Invoice, PriceHistory } from '../types';

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

  // Tasks
  getTasks: (includeArchived?: boolean) => Promise<Task[]>;
  addTask: (t: Task) => Promise<void>;
  updateTask: (t: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  // Products
  getProducts: () => Promise<ProductTrace[]>;
  addProduct: (p: ProductTrace) => Promise<void>;
  updateProduct: (p: ProductTrace) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // Invoices
  getInvoices: () => Promise<Invoice[]>;
  addInvoice: (i: Invoice) => Promise<void>;
  updateInvoice: (i: Invoice) => Promise<void>;
  deleteInvoice: (id: string) => Promise<void>;

  // Recurring tasks
  processRecurringTasks: () => Promise<void>;

  // Price history
  updatePriceHistory: (invoice: Invoice) => Promise<void>;
  getPriceHistory: () => Promise<PriceHistory[]>;
}

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
    set({ darkMode: v });
    db.settings.update('default', { darkMode: v });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  loadEquipment: async () => {
    const list = await db.equipment.orderBy('order').toArray();
    set({ equipment: list });
  },

  addEquipment: async (e) => {
    await db.equipment.add({ ...e, name: sanitize(e.name) });
    const list = await db.equipment.orderBy('order').toArray();
    set({ equipment: list });
  },

  updateEquipment: async (e) => {
    await db.equipment.put(e);
    const list = await db.equipment.orderBy('order').toArray();
    set({ equipment: list });
  },

  deleteEquipment: async (id) => {
    await db.equipment.delete(id);
    const list = await db.equipment.orderBy('order').toArray();
    set({ equipment: list });
  },

  addTemperatureRecord: async (r) => {
    await db.temperatureRecords.add(r);
  },

  getTemperatureRecords: async (startDate, endDate, equipmentId) => {
    let collection = db.temperatureRecords.orderBy('timestamp');
    const records = await collection.reverse().toArray();
    return records.filter(r => {
      const ts = new Date(r.timestamp).getTime();
      if (startDate && ts < startDate.getTime()) return false;
      if (endDate && ts > endDate.getTime()) return false;
      if (equipmentId && r.equipmentId !== equipmentId) return false;
      return true;
    });
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

  getProducts: async () => {
    return db.productTraces.orderBy('scannedAt').reverse().toArray();
  },

  addProduct: async (p) => {
    await db.productTraces.add({
      ...p,
      productName: sanitize(p.productName),
      supplier: sanitize(p.supplier),
      lotNumber: sanitize(p.lotNumber),
      category: sanitize(p.category),
      barcode: p.barcode ? sanitize(p.barcode) : undefined,
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
    });
  },

  deleteProduct: async (id) => {
    await db.productTraces.delete(id);
  },

  getInvoices: async () => {
    return db.invoices.orderBy('scannedAt').reverse().toArray();
  },

  addInvoice: async (i) => {
    await db.invoices.add({
      ...i,
      supplier: sanitize(i.supplier),
      invoiceNumber: sanitize(i.invoiceNumber),
      ocrText: sanitize(i.ocrText),
      tags: i.tags.map(sanitize),
      items: i.items.map(item => ({ ...item, designation: sanitize(item.designation) })),
    });
  },

  updateInvoice: async (i) => {
    await db.invoices.put({
      ...i,
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

  updatePriceHistory: async (invoice) => {
    for (const item of invoice.items) {
      const key = `${item.designation.toLowerCase()}_${invoice.supplier.toLowerCase()}`;
      const existing = await db.priceHistory.get(key);

      if (existing) {
        const prices = [...existing.prices, { date: invoice.invoiceDate, price: item.unitPriceHT }];
        const priceValues = prices.map(p => p.price);
        await db.priceHistory.put({
          ...existing,
          prices,
          averagePrice: Math.round((priceValues.reduce((s, p) => s + p, 0) / priceValues.length) * 100) / 100,
          minPrice: Math.min(...priceValues),
          maxPrice: Math.max(...priceValues),
        });
      } else {
        await db.priceHistory.add({
          id: key,
          itemName: item.designation,
          supplier: invoice.supplier,
          prices: [{ date: invoice.invoiceDate, price: item.unitPriceHT }],
          averagePrice: item.unitPriceHT,
          minPrice: item.unitPriceHT,
          maxPrice: item.unitPriceHT,
        });
      }
    }
  },

  getPriceHistory: async () => {
    return db.priceHistory.toArray();
  },
}));
