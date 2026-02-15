import Dexie, { type Table } from 'dexie';
import type {
  Equipment,
  TemperatureRecord,
  ProductTrace,
  Task,
  Order,
  Invoice,
  PriceHistory,
  AppSettings,
  Ingredient,
  Recipe,
  RecipeIngredient,
  SupplierProductMapping,
  OilChangeRecord,
} from '../types';
import { GINEYS_CATALOG_ITEMS } from '../data/gineysCatalog';
import { normalizeKeyPart } from '../utils';

class CuisineDB extends Dexie {
  equipment!: Table<Equipment>;
  temperatureRecords!: Table<TemperatureRecord>;
  oilChangeRecords!: Table<OilChangeRecord>;
  productTraces!: Table<ProductTrace>;
  tasks!: Table<Task>;
  orders!: Table<Order>;
  invoices!: Table<Invoice>;
  priceHistory!: Table<PriceHistory>;
  settings!: Table<AppSettings>;
  ingredients!: Table<Ingredient>;
  recipes!: Table<Recipe>;
  recipeIngredients!: Table<RecipeIngredient>;
  supplierProductMappings!: Table<SupplierProductMapping>;
  backupSnapshots!: Table<{ id: string; payload: string; createdAt: Date }>;

  constructor() {
    super('CuisineApp');
    this.version(1).stores({
      equipment: 'id, name, type, order',
      temperatureRecords: 'id, equipmentId, timestamp, isCompliant',
      productTraces: 'id, barcode, productName, supplier, category, receptionDate, expirationDate, scannedAt',
      tasks: 'id, category, priority, completed, createdAt, archived, order',
      invoices: 'id, supplier, invoiceNumber, invoiceDate, totalTTC, scannedAt, *tags',
      priceHistory: 'id, itemName, supplier, [itemName+supplier]',
      settings: 'id',
    });

    this.version(2).stores({
      equipment: 'id, name, type, order',
      temperatureRecords: 'id, equipmentId, timestamp, isCompliant',
      productTraces: 'id, barcode, productName, supplier, category, receptionDate, expirationDate, scannedAt',
      tasks: 'id, category, priority, completed, createdAt, archived, order',
      invoices: 'id, supplier, invoiceNumber, invoiceDate, totalTTC, scannedAt, *tags',
      priceHistory: 'id, itemName, supplier, [itemName+supplier]',
      settings: 'id',
      ingredients: 'id, name, unit, supplierId',
      recipes: 'id, title, updatedAt',
      recipeIngredients: 'id, recipeId, ingredientId, [recipeId+ingredientId]',
    });

    this.version(3).stores({
      equipment: 'id, name, type, order',
      temperatureRecords: 'id, equipmentId, timestamp, isCompliant',
      productTraces: 'id, barcode, productName, supplier, category, receptionDate, expirationDate, scannedAt',
      tasks: 'id, category, priority, completed, createdAt, archived, order',
      invoices: 'id, supplier, invoiceNumber, invoiceDate, totalTTC, scannedAt, *tags',
      priceHistory: 'id, itemName, supplier, [itemName+supplier]',
      settings: 'id',
      ingredients: 'id, name, unit, supplierId',
      recipes: 'id, title, updatedAt',
      recipeIngredients: 'id, recipeId, ingredientId, [recipeId+ingredientId]',
      supplierProductMappings:
        'id, supplierId, supplierSku, supplierLabelNormalized, templateRecipeId, [supplierId+supplierSku], [supplierId+supplierLabelNormalized]',
    });

    this.version(4).stores({
      equipment: 'id, name, type, order',
      temperatureRecords: 'id, equipmentId, timestamp, isCompliant, [equipmentId+timestamp]',
      productTraces: 'id, barcode, productName, supplier, category, receptionDate, expirationDate, scannedAt',
      tasks: 'id, category, priority, completed, createdAt, archived, order',
      invoices: 'id, supplier, invoiceNumber, invoiceDate, totalTTC, scannedAt, *tags',
      priceHistory: 'id, itemName, supplier, [itemName+supplier]',
      settings: 'id',
      ingredients: 'id, name, unit, supplierId',
      recipes: 'id, title, updatedAt',
      recipeIngredients: 'id, recipeId, ingredientId, [recipeId+ingredientId]',
      supplierProductMappings:
        'id, supplierId, supplierSku, supplierLabelNormalized, templateRecipeId, [supplierId+supplierSku], [supplierId+supplierLabelNormalized]',
      backupSnapshots: 'id, createdAt',
    });

    this.version(5).stores({
      equipment: 'id, name, type, order',
      temperatureRecords: 'id, equipmentId, timestamp, isCompliant, [equipmentId+timestamp]',
      oilChangeRecords: 'id, fryerId, changedAt, [fryerId+changedAt]',
      productTraces: 'id, barcode, productName, supplier, category, receptionDate, expirationDate, scannedAt',
      tasks: 'id, category, priority, completed, createdAt, archived, order',
      invoices: 'id, supplier, invoiceNumber, invoiceDate, totalTTC, scannedAt, *tags',
      priceHistory: 'id, itemName, supplier, [itemName+supplier]',
      settings: 'id',
      ingredients: 'id, name, unit, supplierId',
      recipes: 'id, title, updatedAt',
      recipeIngredients: 'id, recipeId, ingredientId, [recipeId+ingredientId]',
      supplierProductMappings:
        'id, supplierId, supplierSku, supplierLabelNormalized, templateRecipeId, [supplierId+supplierSku], [supplierId+supplierLabelNormalized]',
      backupSnapshots: 'id, createdAt',
    });

    // Version 6: add conditioningQuantity to ingredients (optional field, no index change needed)
    this.version(6).stores({});

    // Version 7: confirm indexes for expirationDate (productTraces) and supplier (invoices)
    // Both indexes already existed since version 1; this bump is a no-schema-change version.
    this.version(7).stores({});

    this.version(8)
      .stores({
        productTraces:
          'id, barcode, productName, supplier, category, receptionDate, expirationDate, status, scannedAt',
      })
      .upgrade(async (tx) => {
        await tx.table<ProductTrace>('productTraces').toCollection().modify((product) => {
          const row = product as ProductTrace & { status?: ProductTrace['status'] };
          if (!row.status) {
            row.status = 'active';
          }
        });
      });

    this.version(9)
      .stores({
        orders: 'id, supplier, status, orderDate, createdAt, orderNumber',
      })
      .upgrade(async (tx) => {
        type LegacyTaskRecord = Omit<Task, 'category'> & { category: Task['category'] | 'commandes' };

        const taskTable = tx.table<LegacyTaskRecord>('tasks');
        const orderTable = tx.table<Order>('orders');
        const legacyTasks = await taskTable.toArray();
        const commandTasks = legacyTasks.filter((task) => task.category === 'commandes');
        if (commandTasks.length === 0) return;

        const sequenceByYear = new Map<number, number>();
        commandTasks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        const migratedOrders: Order[] = commandTasks.map((task) => {
          const orderDate = Number.isFinite(new Date(task.createdAt).getTime())
            ? new Date(task.createdAt)
            : new Date();
          const year = orderDate.getFullYear();
          const nextSeq = (sequenceByYear.get(year) ?? 0) + 1;
          sequenceByYear.set(year, nextSeq);
          const paddedSeq = String(nextSeq).padStart(3, '0');

          return {
            id: task.id,
            orderNumber: `CMD-${year}-${paddedSeq}`,
            supplier: 'A definir',
            status: task.completed ? 'received' : 'draft',
            items: [
              {
                id: `${task.id}-1`,
                productName: task.title,
                quantity: 1,
                unit: 'unite',
                notes: task.notes,
              },
            ],
            orderDate,
            expectedDeliveryDate: undefined,
            actualDeliveryDate: task.completedAt ? new Date(task.completedAt) : undefined,
            totalHT: 0,
            notes: task.notes,
            invoiceId: undefined,
            createdAt: orderDate,
            updatedAt: task.completedAt ? new Date(task.completedAt) : orderDate,
          };
        });

        if (migratedOrders.length > 0) {
          await orderTable.bulkPut(migratedOrders);
          await taskTable.bulkDelete(commandTasks.map((task) => task.id));
        }
      });
  }
}

export const db = new CuisineDB();

const GINEYS_SUPPLIER_NAME = "Giney's";

function buildPriceHistoryKey(itemName: string, supplier: string): string {
  return `${normalizeKeyPart(itemName)}_${normalizeKeyPart(supplier)}`;
}

export async function initDefaultData() {
  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await db.settings.add({
      id: 'default',
      establishmentName: 'Mon Établissement',
      darkMode: false,
      onboardingDone: false,
      priceAlertThreshold: 10,
    });
  }

  const equipCount = await db.equipment.count();
  if (equipCount === 0) {
    await db.equipment.bulkAdd([
      { id: crypto.randomUUID(), name: 'Frigo 1', type: 'fridge', minTemp: 0, maxTemp: 4, order: 0 },
      { id: crypto.randomUUID(), name: 'Frigo 2', type: 'fridge', minTemp: 0, maxTemp: 4, order: 1 },
      { id: crypto.randomUUID(), name: 'Congelateur', type: 'freezer', minTemp: -25, maxTemp: -18, order: 2 },
      { id: crypto.randomUUID(), name: 'Chambre froide', type: 'cold_room', minTemp: 0, maxTemp: 3, order: 3 },
    ]);
  }

  const hasGineysCatalog = await db.priceHistory.where('supplier').equals(GINEYS_SUPPLIER_NAME).count();
  if (hasGineysCatalog === 0) {
    const seededRows = GINEYS_CATALOG_ITEMS.map((itemName) => ({
      id: buildPriceHistoryKey(itemName, GINEYS_SUPPLIER_NAME),
      itemName,
      supplier: GINEYS_SUPPLIER_NAME,
      prices: [] as { date: Date; price: number }[],
      averagePrice: 0,
      minPrice: 0,
      maxPrice: 0,
    }));
    await db.priceHistory.bulkPut(seededRows);
  }
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  usagePercent: number;
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    const usagePercent = quota > 0 ? (usage / quota) * 100 : 0;
    return { usage, quota, usagePercent };
  } catch {
    return null;
  }
}
