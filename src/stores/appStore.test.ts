import { describe, it, expect, beforeEach } from 'vitest';
import { db, initDefaultData } from '../services/db';
import { useAppStore } from './appStore';
import type { Equipment, Invoice, ProductTrace, Task } from '../types';

beforeEach(async () => {
  // Clear all tables before each test
  await db.equipment.clear();
  await db.temperatureRecords.clear();
  await db.tasks.clear();
  await db.productTraces.clear();
  await db.invoices.clear();
  await db.priceHistory.clear();
  await db.settings.clear();
  await db.ingredients.clear();
  await db.recipes.clear();
  await db.recipeIngredients.clear();
  await db.supplierProductMappings.clear();
  await db.backupSnapshots.clear();

  // Reset store state
  useAppStore.setState({ settings: null, equipment: [], darkMode: false, activeTab: 'temperature' });
});

describe('initDefaultData', () => {
  it('creates default settings and equipment', async () => {
    await initDefaultData();
    const settings = await db.settings.get('default');
    expect(settings).toBeDefined();
    expect(settings!.establishmentName).toBe('Mon Établissement');

    const equip = await db.equipment.toArray();
    expect(equip.length).toBe(4);
  });

  it('does not duplicate data on second call', async () => {
    await initDefaultData();
    await initDefaultData();
    const settings = await db.settings.toArray();
    expect(settings.length).toBe(1);
    const equip = await db.equipment.toArray();
    expect(equip.length).toBe(4);
  });
});

describe('settings', () => {
  it('loads settings from db', async () => {
    await initDefaultData();
    await useAppStore.getState().loadSettings();
    const { settings } = useAppStore.getState();
    expect(settings).toBeDefined();
    expect(settings!.id).toBe('default');
  });

  it('updates settings', async () => {
    await initDefaultData();
    await useAppStore.getState().loadSettings();
    await useAppStore.getState().updateSettings({ establishmentName: 'Test Restaurant' });
    const { settings } = useAppStore.getState();
    expect(settings!.establishmentName).toBe('Test Restaurant');

    const stored = await db.settings.get('default');
    expect(stored!.establishmentName).toBe('Test Restaurant');
  });
});

describe('equipment CRUD', () => {
  const makeEquipment = (overrides: Partial<Equipment> = {}): Equipment => ({
    id: crypto.randomUUID(),
    name: 'Frigo Test',
    type: 'fridge',
    minTemp: 0,
    maxTemp: 4,
    order: 0,
    ...overrides,
  });

  it('adds and loads equipment', async () => {
    const eq = makeEquipment();
    await useAppStore.getState().addEquipment(eq);
    await useAppStore.getState().loadEquipment();
    const { equipment } = useAppStore.getState();
    expect(equipment.length).toBe(1);
    expect(equipment[0].name).toBe('Frigo Test');
  });

  it('sanitizes equipment name on add', async () => {
    const eq = makeEquipment({ name: '<script>alert(1)</script>Frigo' });
    await useAppStore.getState().addEquipment(eq);
    await useAppStore.getState().loadEquipment();
    const { equipment } = useAppStore.getState();
    expect(equipment[0].name).not.toContain('<script>');
  });

  it('updates equipment', async () => {
    const eq = makeEquipment();
    await useAppStore.getState().addEquipment(eq);
    await useAppStore.getState().updateEquipment({ ...eq, name: 'Frigo Updated' });
    await useAppStore.getState().loadEquipment();
    const { equipment } = useAppStore.getState();
    expect(equipment[0].name).toBe('Frigo Updated');
  });

  it('deletes equipment', async () => {
    const eq = makeEquipment();
    await useAppStore.getState().addEquipment(eq);
    await useAppStore.getState().deleteEquipment(eq.id);
    await useAppStore.getState().loadEquipment();
    const { equipment } = useAppStore.getState();
    expect(equipment.length).toBe(0);
  });
});

describe('temperature records', () => {
  it('adds and retrieves records', async () => {
    const store = useAppStore.getState();
    await store.addTemperatureRecord({
      id: crypto.randomUUID(),
      equipmentId: 'eq-1',
      temperature: 3.5,
      timestamp: new Date(),
      isCompliant: true,
    });
    const records = await store.getTemperatureRecords();
    expect(records.length).toBe(1);
    expect(records[0].temperature).toBe(3.5);
  });

  it('filters by equipment id', async () => {
    const store = useAppStore.getState();
    await store.addTemperatureRecord({
      id: crypto.randomUUID(),
      equipmentId: 'eq-1',
      temperature: 3,
      timestamp: new Date(),
      isCompliant: true,
    });
    await store.addTemperatureRecord({
      id: crypto.randomUUID(),
      equipmentId: 'eq-2',
      temperature: -20,
      timestamp: new Date(),
      isCompliant: true,
    });
    const filtered = await store.getTemperatureRecords(undefined, undefined, 'eq-1');
    expect(filtered.length).toBe(1);
    expect(filtered[0].equipmentId).toBe('eq-1');
  });
});

describe('tasks', () => {
  const makeTask = (overrides: Partial<Task> = {}): Task => ({
    id: crypto.randomUUID(),
    title: 'Test Task',
    category: 'autre',
    priority: 'normal',
    completed: false,
    recurring: null,
    createdAt: new Date(),
    archived: false,
    order: 0,
    ...overrides,
  });

  it('adds and retrieves tasks', async () => {
    const store = useAppStore.getState();
    await store.addTask(makeTask());
    const tasks = await store.getTasks();
    expect(tasks.length).toBe(1);
  });

  it('excludes archived tasks by default', async () => {
    const store = useAppStore.getState();
    await store.addTask(makeTask({ archived: false }));
    await store.addTask(makeTask({ archived: true }));
    const active = await store.getTasks(false);
    expect(active.length).toBe(1);
    const all = await store.getTasks(true);
    expect(all.length).toBe(2);
  });

  it('deletes a task', async () => {
    const t = makeTask();
    const store = useAppStore.getState();
    await store.addTask(t);
    await store.deleteTask(t.id);
    const tasks = await store.getTasks(true);
    expect(tasks.length).toBe(0);
  });
});

describe('products', () => {
  const makeProduct = (overrides: Partial<ProductTrace> = {}) => ({
    id: crypto.randomUUID(),
    status: 'active' as const,
    productName: 'Yaourt',
    supplier: 'Metro',
    lotNumber: 'LOT-1',
    receptionDate: new Date(),
    expirationDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    category: 'Produits laitiers',
    scannedAt: new Date(),
    ...overrides,
  });

  it('adds, marks used and deletes a product', async () => {
    const store = useAppStore.getState();
    const product = makeProduct();

    await store.addProduct(product);
    await store.markProductAsUsed(product.id);

    const stored = await db.productTraces.get(product.id);
    expect(stored).toBeDefined();
    expect(stored!.status).toBe('used');
    expect(stored!.usedAt).toBeInstanceOf(Date);

    await store.deleteProduct(product.id);
    const afterDelete = await db.productTraces.get(product.id);
    expect(afterDelete).toBeUndefined();
  });

  it('sanitizes product text fields on add', async () => {
    const store = useAppStore.getState();
    await store.addProduct(
      makeProduct({
        productName: '<script>alert(1)</script>Yaourt',
        supplier: '<b>Metro</b>',
        lotNumber: '<img src=x onerror=alert(1)>LOT-2',
      }),
    );

    const all = await db.productTraces.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].productName).not.toContain('<script>');
    expect(all[0].supplier).not.toContain('<b>');
    expect(all[0].lotNumber).not.toContain('<img');
  });
});

describe('invoices', () => {
  const makeInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
    id: crypto.randomUUID(),
    images: [],
    supplier: 'Metro',
    invoiceNumber: 'INV-001',
    invoiceDate: new Date(),
    items: [{ designation: 'Tomates', quantity: 2, unitPriceHT: 3, totalPriceHT: 6 }],
    totalHT: 6,
    totalTVA: 1.2,
    totalTTC: 7.2,
    ocrText: '',
    tags: [],
    scannedAt: new Date(),
    ...overrides,
  });

  it('adds and retrieves invoices', async () => {
    const store = useAppStore.getState();
    const invoice = makeInvoice();
    await store.addInvoice(invoice);

    const invoices = await store.getInvoices();
    expect(invoices).toHaveLength(1);
    expect(invoices[0].invoiceNumber).toBe('INV-001');
  });

  it('sanitizes invoice supplier and designations', async () => {
    const store = useAppStore.getState();
    await store.addInvoice(
      makeInvoice({
        supplier: '<script>evil()</script>Metro',
        items: [{ designation: '<img src=x>Tomates', quantity: 2, unitPriceHT: 3, totalPriceHT: 6 }],
      }),
    );

    const invoices = await db.invoices.toArray();
    expect(invoices).toHaveLength(1);
    expect(invoices[0].supplier).not.toContain('<script>');
    expect(invoices[0].items[0].designation).not.toContain('<img');
  });
});

describe('processRecurringTasks', () => {
  it('recreates daily recurring task from archived completed', async () => {
    const store = useAppStore.getState();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await store.addTask({
      id: crypto.randomUUID(),
      title: 'Daily Clean',
      category: 'nettoyage',
      priority: 'normal',
      completed: true,
      recurring: 'daily',
      createdAt: yesterday,
      completedAt: yesterday,
      archived: true,
      order: 0,
    });

    await store.processRecurringTasks();
    const tasks = await store.getTasks(false);
    expect(tasks.length).toBe(1);
    expect(tasks[0].title).toBe('Daily Clean');
    expect(tasks[0].completed).toBe(false);
    expect(tasks[0].archived).toBe(false);
  });

  it('does not duplicate if active copy exists', async () => {
    const store = useAppStore.getState();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Archived completed recurring
    await store.addTask({
      id: crypto.randomUUID(),
      title: 'Daily Clean',
      category: 'nettoyage',
      priority: 'normal',
      completed: true,
      recurring: 'daily',
      createdAt: yesterday,
      completedAt: yesterday,
      archived: true,
      order: 0,
    });

    // Already existing active copy
    await store.addTask({
      id: crypto.randomUUID(),
      title: 'Daily Clean',
      category: 'nettoyage',
      priority: 'normal',
      completed: false,
      recurring: 'daily',
      createdAt: new Date(),
      archived: false,
      order: 1,
    });

    await store.processRecurringTasks();
    const tasks = await store.getTasks(false);
    expect(tasks.length).toBe(1);
  });
});

describe('price history', () => {
  it('creates price history from invoice', async () => {
    const store = useAppStore.getState();
    const invoice: Invoice = {
      id: crypto.randomUUID(),
      images: [],
      supplier: 'Pomona',
      invoiceNumber: 'INV-001',
      invoiceDate: new Date(),
      items: [
        { designation: 'Tomates', quantity: 10, unitPriceHT: 2.50, totalPriceHT: 25 },
      ],
      totalHT: 25,
      totalTVA: 5,
      totalTTC: 30,
      ocrText: '',
      tags: [],
      scannedAt: new Date(),
    };

    await store.updatePriceHistory(invoice);
    const history = await store.getPriceHistory();
    expect(history.length).toBe(1);
    expect(history[0].itemName).toBe('Tomates');
    expect(history[0].averagePrice).toBe(2.50);
    expect(history[0].minPrice).toBe(2.50);
    expect(history[0].maxPrice).toBe(2.50);
  });

  it('updates existing price history with new invoice', async () => {
    const store = useAppStore.getState();
    const makeInvoice = (price: number): Invoice => ({
      id: crypto.randomUUID(),
      images: [],
      supplier: 'Pomona',
      invoiceNumber: `INV-${price}`,
      invoiceDate: new Date(),
      items: [
        { designation: 'Tomates', quantity: 10, unitPriceHT: price, totalPriceHT: price * 10 },
      ],
      totalHT: price * 10,
      totalTVA: 0,
      totalTTC: price * 10,
      ocrText: '',
      tags: [],
      scannedAt: new Date(),
    });

    await store.updatePriceHistory(makeInvoice(2.00));
    await store.updatePriceHistory(makeInvoice(4.00));

    const history = await store.getPriceHistory();
    expect(history.length).toBe(1);
    expect(history[0].prices.length).toBe(2);
    expect(history[0].averagePrice).toBe(3.00);
    expect(history[0].minPrice).toBe(2.00);
    expect(history[0].maxPrice).toBe(4.00);
  });
});
