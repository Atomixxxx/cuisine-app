import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../services/db';
import { useAppStore } from '../stores/appStore';
import { buildSmartAlerts } from '../services/smartAlerts';

beforeEach(async () => {
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

  useAppStore.setState({ settings: null, equipment: [], darkMode: false, activeTab: 'temperature' });
});

describe('HACCP critical flow', () => {
  it('records an anomaly and exposes a danger alert', async () => {
    const store = useAppStore.getState();
    const now = new Date();

    await store.addEquipment({
      id: 'eq-1',
      name: 'Frigo test',
      type: 'fridge',
      minTemp: 0,
      maxTemp: 4,
      order: 0,
    });

    await store.addTemperatureRecord({
      id: 'rec-1',
      equipmentId: 'eq-1',
      temperature: 10,
      timestamp: now,
      isCompliant: false,
    });

    const records = await store.getTemperatureRecords(
      new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999),
    );

    const alerts = buildSmartAlerts({
      equipment: useAppStore.getState().equipment,
      todayRecords: records,
      tasks: [],
      products: [],
    });

    expect(records).toHaveLength(1);
    expect(alerts[0].severity).toBe('danger');
    expect(alerts.some((alert) => alert.id === 'temp-anomalies')).toBe(true);
  });
});
