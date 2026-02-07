import { describe, expect, it } from 'vitest';
import { buildSmartAlerts } from './smartAlerts';

describe('smart alerts', () => {
  it('returns all-clear info alert when nothing is critical', () => {
    const alerts = buildSmartAlerts({
      equipment: [],
      todayRecords: [],
      tasks: [],
      products: [],
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('all-clear');
    expect(alerts[0].severity).toBe('info');
  });

  it('prioritizes danger alerts before warning alerts', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const expiredDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const soonDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const alerts = buildSmartAlerts({
      equipment: [
        { id: 'eq-1', name: 'Frigo', type: 'fridge', minTemp: 0, maxTemp: 4, order: 0 },
        { id: 'eq-2', name: 'Congel', type: 'freezer', minTemp: -25, maxTemp: -18, order: 1 },
      ],
      todayRecords: [
        { id: 'r-1', equipmentId: 'eq-1', temperature: 12, timestamp: now, isCompliant: false },
      ],
      tasks: [
        {
          id: 't-1',
          title: 'Controle',
          category: 'nettoyage',
          priority: 'normal',
          completed: false,
          recurring: null,
          createdAt: yesterday,
          archived: false,
          order: 0,
        },
      ],
      products: [
        {
          id: 'p-1',
          productName: 'Viande',
          supplier: 'S1',
          lotNumber: 'L1',
          receptionDate: yesterday,
          expirationDate: expiredDate,
          category: 'Viande',
          scannedAt: now,
        },
        {
          id: 'p-2',
          productName: 'Poisson',
          supplier: 'S2',
          lotNumber: 'L2',
          receptionDate: yesterday,
          expirationDate: soonDate,
          category: 'Poisson',
          scannedAt: now,
        },
      ],
    });

    expect(alerts.length).toBeGreaterThan(1);
    expect(alerts[0].severity).toBe('danger');
    expect(alerts.some((alert) => alert.id === 'temp-anomalies')).toBe(true);
    expect(alerts.some((alert) => alert.id === 'expired-products')).toBe(true);
  });
});
