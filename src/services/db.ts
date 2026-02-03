import Dexie, { type Table } from 'dexie';
import type { Equipment, TemperatureRecord, ProductTrace, Task, Invoice, PriceHistory, AppSettings } from '../types';

class CuisineDB extends Dexie {
  equipment!: Table<Equipment>;
  temperatureRecords!: Table<TemperatureRecord>;
  productTraces!: Table<ProductTrace>;
  tasks!: Table<Task>;
  invoices!: Table<Invoice>;
  priceHistory!: Table<PriceHistory>;
  settings!: Table<AppSettings>;

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
  }
}

export const db = new CuisineDB();

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
      { id: crypto.randomUUID(), name: 'Congélateur', type: 'freezer', minTemp: -25, maxTemp: -18, order: 2 },
      { id: crypto.randomUUID(), name: 'Chambre froide', type: 'cold_room', minTemp: 0, maxTemp: 3, order: 3 },
    ]);
  }
}
