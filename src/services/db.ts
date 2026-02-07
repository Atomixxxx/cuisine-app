import Dexie, { type Table } from 'dexie';
import type {
  Equipment,
  TemperatureRecord,
  ProductTrace,
  Task,
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

class CuisineDB extends Dexie {
  equipment!: Table<Equipment>;
  temperatureRecords!: Table<TemperatureRecord>;
  oilChangeRecords!: Table<OilChangeRecord>;
  productTraces!: Table<ProductTrace>;
  tasks!: Table<Task>;
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
  }
}

export const db = new CuisineDB();

const GINEYS_SUPPLIER_NAME = "Giney's";

function normalizeKeyPart(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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
