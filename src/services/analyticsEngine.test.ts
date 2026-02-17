import { describe, expect, it, afterAll, beforeAll, vi } from 'vitest';
import { format, startOfDay, startOfMonth, subDays } from 'date-fns';
import {
  computeAllRecipeCosts,
  computeComplianceTrend,
  computeEquipmentBreakdown,
  computeMonthlySpend,
  computeMonthInvoiceCount,
  computePriceVariation,
  computeTopExpensiveIngredients,
  computeTopVolatileItems,
  type RecipeCostRow,
} from './analyticsEngine';
import type { Equipment, Ingredient, Invoice, PriceHistory, Recipe, RecipeIngredient, TemperatureRecord } from '../types';

const NOW = new Date(2026, 1, 15, 12, 0, 0);
const TODAY = startOfDay(NOW);

function makeRecord(overrides: Partial<TemperatureRecord> = {}): TemperatureRecord {
  return {
    id: 'record-default',
    equipmentId: 'eq-1',
    temperature: 3,
    timestamp: TODAY,
    isCompliant: true,
    ...overrides,
  };
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'invoice-default',
    images: [],
    supplier: 'Fournisseur A',
    invoiceNumber: 'FAC-001',
    invoiceDate: TODAY,
    items: [
      {
        designation: 'Produit test',
        quantity: 1,
        unitPriceHT: 10,
        totalPriceHT: 10,
      },
    ],
    totalHT: 100,
    totalTVA: 20,
    totalTTC: 120,
    ocrText: '',
    tags: [],
    scannedAt: TODAY,
    ...overrides,
  };
}

function makePriceHistory(overrides: Partial<PriceHistory> = {}): PriceHistory {
  return {
    id: 'price-default',
    itemName: 'Article test',
    supplier: 'Fournisseur A',
    prices: [],
    averagePrice: 10,
    minPrice: 8,
    maxPrice: 12,
    ...overrides,
  };
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('computePriceVariation', () => {
  it('returns expected variation when values are valid', () => {
    const history = makePriceHistory({ minPrice: 5, maxPrice: 10, averagePrice: 7 });
    const variation = computePriceVariation(history);

    expect(variation).toBeCloseTo(71.42857, 4);
  });

  it('returns 0 when averagePrice is 0', () => {
    const history = makePriceHistory({ minPrice: 5, maxPrice: 10, averagePrice: 0 });
    expect(computePriceVariation(history)).toBe(0);
  });

  it('returns 0 when minPrice equals maxPrice', () => {
    const history = makePriceHistory({ minPrice: 9, maxPrice: 9, averagePrice: 9 });
    expect(computePriceVariation(history)).toBe(0);
  });
});

describe('computeMonthlySpend', () => {
  it('sums invoices by month and ignores invoices outside the window', () => {
    const currentMonth = makeInvoice({ id: 'inv-1', totalHT: 100, invoiceDate: new Date(2026, 1, 5) });
    const currentMonth2 = makeInvoice({ id: 'inv-2', totalHT: 50, invoiceDate: new Date(2026, 1, 20) });
    const outOfWindow = makeInvoice({ id: 'inv-3', totalHT: 999, invoiceDate: new Date(2025, 7, 10) });

    const points = computeMonthlySpend([currentMonth, currentMonth2, outOfWindow], 3);
    const currentMonthLabel = format(startOfMonth(NOW), 'MM/yy');
    const currentPoint = points.find((point) => point.month === currentMonthLabel);

    expect(points).toHaveLength(3);
    expect(currentPoint?.total).toBe(150);
    expect(points.reduce((sum, point) => sum + point.total, 0)).toBe(150);
  });

  it('returns N slots with zero when invoices are empty', () => {
    const points = computeMonthlySpend([], 4);
    expect(points).toHaveLength(4);
    expect(points.every((point) => point.total === 0)).toBe(true);
  });

  it('returns only the current month when months is 1', () => {
    const points = computeMonthlySpend([], 1);
    expect(points).toHaveLength(1);
    expect(points[0]?.month).toBe(format(startOfMonth(NOW), 'MM/yy'));
    expect(points[0]?.total).toBe(0);
  });
});

describe('computeTopVolatileItems', () => {
  it('filters by threshold, sorts desc, and limits to N', () => {
    const items = [
      makePriceHistory({ id: 'low', averagePrice: 10, minPrice: 9, maxPrice: 10.5 }),
      makePriceHistory({ id: 'mid', averagePrice: 10, minPrice: 8, maxPrice: 12 }),
      makePriceHistory({ id: 'high', averagePrice: 10, minPrice: 6, maxPrice: 14 }),
    ];

    const top = computeTopVolatileItems(items, 10, 2);
    expect(top.map((item) => item.id)).toEqual(['high', 'mid']);
  });

  it('returns empty array when no item is above threshold', () => {
    const items = [
      makePriceHistory({ id: 'a', averagePrice: 10, minPrice: 9.8, maxPrice: 10.2 }),
      makePriceHistory({ id: 'b', averagePrice: 12, minPrice: 11.9, maxPrice: 12.1 }),
    ];

    expect(computeTopVolatileItems(items, 10, 3)).toEqual([]);
  });

  it('returns at most N items when all are above threshold', () => {
    const items = [
      makePriceHistory({ id: 'a', averagePrice: 10, minPrice: 7, maxPrice: 13 }),
      makePriceHistory({ id: 'b', averagePrice: 10, minPrice: 6, maxPrice: 14 }),
      makePriceHistory({ id: 'c', averagePrice: 10, minPrice: 5, maxPrice: 15 }),
    ];

    const top = computeTopVolatileItems(items, 5, 2);
    expect(top).toHaveLength(2);
  });
});

describe('computeAllRecipeCosts', () => {
  it('computes recipe totals, warning levels, ingredient sorting, and result sorting', () => {
    const recipes: Recipe[] = [
      { id: 'r-low', title: 'Soupe', portions: 1, salePriceHT: 20, createdAt: NOW, updatedAt: NOW },
      { id: 'r-high', title: 'Steak', portions: 1, salePriceHT: 10, createdAt: NOW, updatedAt: NOW },
      { id: 'r-empty', title: 'Eau', portions: 1, salePriceHT: 5, createdAt: NOW, updatedAt: NOW },
    ];
    const ingredients: Ingredient[] = [
      { id: 'i-flour', name: 'Farine', unit: 'kg', unitPrice: 2 },
      { id: 'i-oil', name: 'Huile', unit: 'l', unitPrice: 4 },
      { id: 'i-beef', name: 'Boeuf', unit: 'kg', unitPrice: 20 },
    ];
    const links: RecipeIngredient[] = [
      { id: 'l-1', recipeId: 'r-low', ingredientId: 'i-flour', requiredQuantity: 1000, requiredUnit: 'g' },
      { id: 'l-2', recipeId: 'r-low', ingredientId: 'i-oil', requiredQuantity: 1000, requiredUnit: 'ml' },
      { id: 'l-3', recipeId: 'r-high', ingredientId: 'i-beef', requiredQuantity: 300, requiredUnit: 'g' },
    ];

    const rows = computeAllRecipeCosts(recipes, links, ingredients);
    const low = rows.find((row) => row.recipeId === 'r-low');
    const high = rows.find((row) => row.recipeId === 'r-high');
    const empty = rows.find((row) => row.recipeId === 'r-empty');

    expect(rows.map((row) => row.recipeId)).toEqual(['r-high', 'r-low', 'r-empty']);

    expect(low?.totalCost).toBeCloseTo(6, 5);
    expect(low?.foodCostRate).toBeCloseTo(0.3, 5);
    expect(low?.warningLevel).toBe('warning');
    expect(low?.ingredientCosts.map((line) => line.ingredientName)).toEqual(['Huile', 'Farine']);

    expect(high?.totalCost).toBeCloseTo(6, 5);
    expect(high?.foodCostRate).toBeCloseTo(0.6, 5);
    expect(high?.warningLevel).toBe('danger');

    expect(empty?.totalCost).toBe(0);
    expect(empty?.ingredientCosts).toEqual([]);
  });
});

describe('computeTopExpensiveIngredients', () => {
  it('aggregates same ingredient across recipes and counts distinct recipes', () => {
    const rows: RecipeCostRow[] = [
      {
        recipeId: 'r1',
        recipeTitle: 'Recette 1',
        salePriceHT: 20,
        totalCost: 8,
        grossMargin: 12,
        foodCostRate: 0.4,
        warningLevel: 'danger',
        ingredientCosts: [
          { ingredientId: 'i1', ingredientName: 'Farine', cost: 5 },
          { ingredientId: 'i2', ingredientName: 'Beurre', cost: 3 },
        ],
      },
      {
        recipeId: 'r2',
        recipeTitle: 'Recette 2',
        salePriceHT: 25,
        totalCost: 4,
        grossMargin: 21,
        foodCostRate: 0.16,
        warningLevel: 'ok',
        ingredientCosts: [{ ingredientId: 'i1', ingredientName: 'Farine', cost: 2 }],
      },
    ];

    const top = computeTopExpensiveIngredients(rows, 2);
    expect(top[0]).toEqual({ name: 'Farine', totalCost: 7, recipeCount: 2 });
    expect(top[1]).toEqual({ name: 'Beurre', totalCost: 3, recipeCount: 1 });
  });

  it('sorts by total cost desc and limits to N', () => {
    const rows: RecipeCostRow[] = [
      {
        recipeId: 'r1',
        recipeTitle: 'R1',
        totalCost: 0,
        grossMargin: 0,
        foodCostRate: 0,
        warningLevel: 'ok',
        ingredientCosts: [
          { ingredientId: 'i1', ingredientName: 'A', cost: 1 },
          { ingredientId: 'i2', ingredientName: 'B', cost: 10 },
        ],
      },
    ];

    const top = computeTopExpensiveIngredients(rows, 1);
    expect(top).toHaveLength(1);
    expect(top[0]?.name).toBe('B');
  });

  it('returns empty array when there is no ingredient data', () => {
    expect(computeTopExpensiveIngredients([], 5)).toEqual([]);
  });
});

describe('computeComplianceTrend', () => {
  it('computes daily compliance rate and returns exactly N points', () => {
    const records: TemperatureRecord[] = [
      makeRecord({ id: 'r1', timestamp: TODAY, isCompliant: true }),
      makeRecord({ id: 'r2', timestamp: new Date(TODAY.getTime() + 60 * 60 * 1000), isCompliant: true }),
      makeRecord({ id: 'r3', timestamp: new Date(TODAY.getTime() + 2 * 60 * 60 * 1000), isCompliant: false }),
    ];

    const trend = computeComplianceTrend(records, 3);
    const todayLabel = format(TODAY, 'dd/MM');
    const yesterdayLabel = format(startOfDay(subDays(TODAY, 1)), 'dd/MM');
    const todayPoint = trend.find((point) => point.date === todayLabel);
    const yesterdayPoint = trend.find((point) => point.date === yesterdayLabel);

    expect(trend).toHaveLength(3);
    expect(trend.every((point) => /^\d{2}\/\d{2}$/.test(point.date))).toBe(true);
    expect(todayPoint?.rate).toBe(67);
    expect(yesterdayPoint?.rate).toBe(0);
  });
});

describe('computeEquipmentBreakdown', () => {
  it('computes compliance, anomaly count, sorting, and latest temperature', () => {
    const equipment: Equipment[] = [
      { id: 'eq-1', name: 'Frigo A', type: 'fridge', minTemp: 0, maxTemp: 4, order: 0 },
      { id: 'eq-2', name: 'Frigo B', type: 'fridge', minTemp: 0, maxTemp: 4, order: 1 },
      { id: 'eq-3', name: 'Frigo C', type: 'fridge', minTemp: 0, maxTemp: 4, order: 2 },
    ];

    const records: TemperatureRecord[] = [
      makeRecord({ id: 'a1', equipmentId: 'eq-1', timestamp: new Date(NOW.getTime() - 30 * 60 * 1000), temperature: 8, isCompliant: false }),
      makeRecord({ id: 'a2', equipmentId: 'eq-1', timestamp: new Date(NOW.getTime() - 2 * 60 * 60 * 1000), temperature: 3, isCompliant: true }),
      makeRecord({ id: 'a3', equipmentId: 'eq-1', timestamp: subDays(NOW, 1), temperature: 2.5, isCompliant: true }),
      makeRecord({ id: 'a4', equipmentId: 'eq-1', timestamp: subDays(NOW, 2), temperature: 2.8, isCompliant: true }),
      makeRecord({ id: 'a5', equipmentId: 'eq-1', timestamp: subDays(NOW, 3), temperature: 3.1, isCompliant: true }),
      makeRecord({ id: 'c1', equipmentId: 'eq-3', timestamp: new Date(NOW.getTime() - 20 * 60 * 1000), temperature: 11, isCompliant: false }),
      makeRecord({ id: 'c2', equipmentId: 'eq-3', timestamp: new Date(NOW.getTime() - 70 * 60 * 1000), temperature: 10.5, isCompliant: false }),
      makeRecord({ id: 'old', equipmentId: 'eq-1', timestamp: subDays(NOW, 40), temperature: 1, isCompliant: true }),
    ];

    const stats = computeEquipmentBreakdown(records, equipment, 30);
    const eq1 = stats.find((row) => row.equipmentId === 'eq-1');
    const eq2 = stats.find((row) => row.equipmentId === 'eq-2');

    expect(stats[0]?.equipmentId).toBe('eq-3');
    expect(stats[1]?.equipmentId).toBe('eq-1');

    expect(eq1?.totalRecords).toBe(5);
    expect(eq1?.anomalyCount).toBe(1);
    expect(eq1?.complianceRate).toBe(80);
    expect(eq1?.lastTemperature).toBe(8);

    expect(eq2?.totalRecords).toBe(0);
    expect(eq2?.complianceRate).toBe(0);
    expect(eq2?.lastTemperature).toBeNull();
  });
});

describe('computeMonthInvoiceCount', () => {
  it('counts only invoices in the selected month', () => {
    const invoices: Invoice[] = [
      makeInvoice({ id: 'm1', invoiceDate: new Date(2026, 1, 3) }),
      makeInvoice({ id: 'm2', invoiceDate: new Date(2026, 1, 10) }),
      makeInvoice({ id: 'm3', invoiceDate: new Date(2026, 1, 20) }),
      makeInvoice({ id: 'prev', invoiceDate: new Date(2026, 0, 15) }),
    ];

    expect(computeMonthInvoiceCount(invoices, NOW)).toBe(3);
  });

  it('returns 0 when there is no invoice', () => {
    expect(computeMonthInvoiceCount([], NOW)).toBe(0);
  });
});
