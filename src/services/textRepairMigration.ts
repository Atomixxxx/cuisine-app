import { STORAGE_KEYS } from '../constants/storageKeys';
import { db } from './db';
import { repairMojibake } from '../utils';
import { useAppStore } from '../stores/appStore';

const TEXT_REPAIR_VERSION = 'v1';

function getChangedArray(values: string[]): { values: string[]; changed: boolean } {
  let changed = false;
  const next = values.map((value) => {
    const repaired = repairMojibake(value);
    if (repaired !== value) changed = true;
    return repaired;
  });
  return { values: next, changed };
}

export async function runTextRepairMigration(): Promise<'skipped' | 'done'> {
  if (localStorage.getItem(STORAGE_KEYS.textRepairMigrationVersion) === TEXT_REPAIR_VERSION) {
    return 'skipped';
  }

  const equipment = await db.equipment.toArray();
  const equipmentUpdates: typeof equipment = [];
  for (const item of equipment) {
    const name = repairMojibake(item.name);
    if (name !== item.name) {
      equipmentUpdates.push({ ...item, name });
    }
  }
  if (equipmentUpdates.length > 0) await db.equipment.bulkPut(equipmentUpdates);

  const tasks = await db.tasks.toArray();
  const taskUpdates: typeof tasks = [];
  for (const item of tasks) {
    const title = repairMojibake(item.title);
    const notes = item.notes ? repairMojibake(item.notes) : item.notes;
    if (title !== item.title || notes !== item.notes) {
      taskUpdates.push({ ...item, title, notes });
    }
  }
  if (taskUpdates.length > 0) await db.tasks.bulkPut(taskUpdates);

  const products = await db.productTraces.toArray();
  const productUpdates: typeof products = [];
  for (const item of products) {
    const productName = repairMojibake(item.productName);
    const supplier = repairMojibake(item.supplier);
    const lotNumber = repairMojibake(item.lotNumber);
    const category = repairMojibake(item.category);
    const barcode = item.barcode ? repairMojibake(item.barcode) : item.barcode;
    if (
      productName !== item.productName ||
      supplier !== item.supplier ||
      lotNumber !== item.lotNumber ||
      category !== item.category ||
      barcode !== item.barcode
    ) {
      productUpdates.push({ ...item, productName, supplier, lotNumber, category, barcode });
    }
  }
  if (productUpdates.length > 0) await db.productTraces.bulkPut(productUpdates);

  const invoices = await db.invoices.toArray();
  const invoiceUpdates: typeof invoices = [];
  for (const item of invoices) {
    const supplier = repairMojibake(item.supplier);
    const invoiceNumber = repairMojibake(item.invoiceNumber);
    const ocrText = repairMojibake(item.ocrText);
    const tagsResult = getChangedArray(item.tags);
    let itemChanged = false;
    const nextItems = item.items.map((line) => {
      const designation = repairMojibake(line.designation);
      if (designation !== line.designation) itemChanged = true;
      return designation === line.designation ? line : { ...line, designation };
    });

    const changed =
      supplier !== item.supplier ||
      invoiceNumber !== item.invoiceNumber ||
      ocrText !== item.ocrText ||
      tagsResult.changed ||
      itemChanged;

    if (!changed) continue;
    invoiceUpdates.push({
      ...item,
      supplier,
      invoiceNumber,
      ocrText,
      tags: tagsResult.values,
      items: nextItems,
    });
  }
  if (invoiceUpdates.length > 0) {
    await db.invoices.bulkPut(invoiceUpdates);
    await useAppStore.getState().rebuildPriceHistory();
  }

  const ingredients = await db.ingredients.toArray();
  const ingredientUpdates: typeof ingredients = [];
  for (const item of ingredients) {
    const name = repairMojibake(item.name);
    const supplierId = item.supplierId ? repairMojibake(item.supplierId) : item.supplierId;
    if (name !== item.name || supplierId !== item.supplierId) {
      ingredientUpdates.push({ ...item, name, supplierId });
    }
  }
  if (ingredientUpdates.length > 0) await db.ingredients.bulkPut(ingredientUpdates);

  const recipes = await db.recipes.toArray();
  const recipeUpdates: typeof recipes = [];
  for (const item of recipes) {
    const title = repairMojibake(item.title);
    if (title !== item.title) {
      recipeUpdates.push({ ...item, title });
    }
  }
  if (recipeUpdates.length > 0) await db.recipes.bulkPut(recipeUpdates);

  const settings = await db.settings.toArray();
  const settingsUpdates: typeof settings = [];
  for (const item of settings) {
    const establishmentName = repairMojibake(item.establishmentName);
    if (establishmentName !== item.establishmentName) {
      settingsUpdates.push({ ...item, establishmentName });
    }
  }
  if (settingsUpdates.length > 0) await db.settings.bulkPut(settingsUpdates);

  localStorage.setItem(STORAGE_KEYS.textRepairMigrationVersion, TEXT_REPAIR_VERSION);
  return 'done';
}
