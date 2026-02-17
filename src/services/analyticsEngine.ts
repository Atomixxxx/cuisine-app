import { format, startOfDay, startOfMonth, subDays, subMonths } from 'date-fns';
import { computeRecipeCostFromLines, getEffectiveUnitPrice } from './recipeCost';
import type { Equipment, Ingredient, Invoice, PriceHistory, Recipe, RecipeIngredient, RecipeUnit, TemperatureRecord } from '../types';

export interface MonthlySpendPoint {
  month: string;
  total: number;
}

export interface RecipeIngredientCost {
  ingredientId: string;
  ingredientName: string;
  cost: number;
}

export interface RecipeCostRow {
  recipeId: string;
  recipeTitle: string;
  salePriceHT?: number;
  totalCost: number;
  grossMargin: number;
  foodCostRate: number;
  warningLevel: 'ok' | 'warning' | 'danger';
  ingredientCosts: RecipeIngredientCost[];
}

export interface TopIngredientCost {
  name: string;
  totalCost: number;
  recipeCount: number;
}

export interface ComplianceTrendPoint {
  date: string;
  rate: number;
}

export interface EquipmentStat {
  equipmentId: string;
  equipmentName: string;
  complianceRate: number;
  anomalyCount: number;
  totalRecords: number;
  lastTemperature: number | null;
  lastTimestamp: Date | null;
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

function toSafeNumber(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value as number);
}

function toMonthKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeUnit(unit: RecipeUnit): RecipeUnit {
  return unit.toLowerCase() as RecipeUnit;
}

function convertQuantity(value: number, fromUnit: RecipeUnit, toUnit: RecipeUnit): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return value;

  if (from === 'g' && to === 'kg') return value / 1000;
  if (from === 'kg' && to === 'g') return value * 1000;
  if (from === 'ml' && to === 'l') return value / 1000;
  if (from === 'l' && to === 'ml') return value * 1000;

  return null;
}

export function computePriceVariation(history: PriceHistory): number {
  if (history.averagePrice <= 0) return 0;
  return ((history.maxPrice - history.minPrice) / history.averagePrice) * 100;
}

export function computeMonthlySpend(invoices: Invoice[], months = 6): MonthlySpendPoint[] {
  const safeMonths = Math.max(1, Math.floor(months));
  const now = new Date();

  const monthSlots = Array.from({ length: safeMonths }, (_, index) => {
    const monthDate = startOfMonth(subMonths(now, safeMonths - 1 - index));
    return {
      key: toMonthKey(monthDate),
      month: format(monthDate, 'MM/yy'),
      total: 0,
    };
  });
  const byMonth = new Map(monthSlots.map((slot) => [slot.key, slot]));

  for (const invoice of invoices) {
    const invoiceDate = toDate(invoice.invoiceDate);
    const bucket = byMonth.get(toMonthKey(invoiceDate));
    if (!bucket) continue;
    bucket.total += toSafeNumber(invoice.totalHT);
  }

  return monthSlots.map((slot) => ({
    month: slot.month,
    total: Math.round(slot.total * 100) / 100,
  }));
}

export function computeTopVolatileItems(history: PriceHistory[], threshold: number, n = 5): PriceHistory[] {
  const safeThreshold = Math.max(0, threshold);
  const safeLimit = Math.max(1, Math.floor(n));

  return [...history]
    .filter((item) => computePriceVariation(item) > safeThreshold)
    .sort((a, b) => computePriceVariation(b) - computePriceVariation(a))
    .slice(0, safeLimit);
}

export function computeAllRecipeCosts(
  recipes: Recipe[],
  links: RecipeIngredient[],
  ingredients: Ingredient[],
): RecipeCostRow[] {
  const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const linesByRecipe = new Map<string, RecipeIngredient[]>();

  for (const line of links) {
    const recipeLines = linesByRecipe.get(line.recipeId);
    if (recipeLines) {
      recipeLines.push(line);
    } else {
      linesByRecipe.set(line.recipeId, [line]);
    }
  }

  const rows: RecipeCostRow[] = recipes.map((recipe) => {
    const recipeLines = linesByRecipe.get(recipe.id) ?? [];
    const summary = computeRecipeCostFromLines(
      recipeLines.map((line) => ({
        ingredientId: line.ingredientId,
        requiredQuantity: line.requiredQuantity,
        requiredUnit: line.requiredUnit,
      })),
      ingredientMap,
      recipe.salePriceHT,
    );

    const ingredientCostMap = new Map<string, RecipeIngredientCost>();
    for (const line of recipeLines) {
      const ingredient = ingredientMap.get(line.ingredientId);
      if (!ingredient) continue;
      const convertedQuantity = convertQuantity(line.requiredQuantity, line.requiredUnit, ingredient.unit);
      if (convertedQuantity === null || !Number.isFinite(convertedQuantity) || convertedQuantity < 0) continue;
      const lineCost = convertedQuantity * getEffectiveUnitPrice(ingredient);
      const existing = ingredientCostMap.get(ingredient.id);
      if (existing) {
        existing.cost += lineCost;
      } else {
        ingredientCostMap.set(ingredient.id, {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          cost: lineCost,
        });
      }
    }

    return {
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      salePriceHT: recipe.salePriceHT,
      totalCost: summary.totalCost,
      grossMargin: summary.grossMargin,
      foodCostRate: summary.foodCostRate,
      warningLevel: summary.warningLevel,
      ingredientCosts: [...ingredientCostMap.values()].sort((a, b) => b.cost - a.cost),
    };
  });

  return rows.sort((a, b) => b.foodCostRate - a.foodCostRate);
}

export function computeTopExpensiveIngredients(costRows: RecipeCostRow[], n = 5): TopIngredientCost[] {
  const safeLimit = Math.max(1, Math.floor(n));
  const aggregate = new Map<string, { name: string; totalCost: number; recipeIds: Set<string> }>();

  for (const row of costRows) {
    for (const ingredientCost of row.ingredientCosts) {
      const existing = aggregate.get(ingredientCost.ingredientId);
      if (existing) {
        existing.totalCost += ingredientCost.cost;
        existing.recipeIds.add(row.recipeId);
      } else {
        aggregate.set(ingredientCost.ingredientId, {
          name: ingredientCost.ingredientName,
          totalCost: ingredientCost.cost,
          recipeIds: new Set([row.recipeId]),
        });
      }
    }
  }

  return [...aggregate.values()]
    .map((entry) => ({
      name: entry.name,
      totalCost: Math.round(entry.totalCost * 100) / 100,
      recipeCount: entry.recipeIds.size,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, safeLimit);
}

export function computeComplianceTrend(records: TemperatureRecord[], days = 7): ComplianceTrendPoint[] {
  const safeDays = Math.max(1, Math.floor(days));
  const now = new Date();
  const points = Array.from({ length: safeDays }, (_, index) => {
    const day = startOfDay(subDays(now, safeDays - 1 - index));
    return { date: format(day, 'dd/MM'), key: day.toISOString(), total: 0, compliant: 0 };
  });
  const byDay = new Map(points.map((point) => [point.key, point]));

  for (const record of records) {
    const recordDay = startOfDay(toDate(record.timestamp)).toISOString();
    const bucket = byDay.get(recordDay);
    if (!bucket) continue;
    bucket.total += 1;
    if (record.isCompliant) bucket.compliant += 1;
  }

  return points.map((point) => ({
    date: point.date,
    rate: point.total > 0 ? Math.round((point.compliant / point.total) * 100) : 0,
  }));
}

export function computeEquipmentBreakdown(
  records: TemperatureRecord[],
  equipment: Equipment[],
  days = 30,
): EquipmentStat[] {
  const safeDays = Math.max(1, Math.floor(days));
  const minDate = startOfDay(subDays(new Date(), safeDays - 1)).getTime();
  const scopedRecords = records.filter((record) => toDate(record.timestamp).getTime() >= minDate);

  return equipment
    .map((item) => {
      const equipmentRecords = scopedRecords
        .filter((record) => record.equipmentId === item.id)
        .sort((a, b) => toDate(b.timestamp).getTime() - toDate(a.timestamp).getTime());

      const totalRecords = equipmentRecords.length;
      const anomalyCount = equipmentRecords.filter((record) => !record.isCompliant).length;
      const compliantCount = totalRecords - anomalyCount;
      const complianceRate = totalRecords > 0 ? Math.round((compliantCount / totalRecords) * 100) : 0;
      const lastRecord = equipmentRecords[0];

      return {
        equipmentId: item.id,
        equipmentName: item.name,
        complianceRate,
        anomalyCount,
        totalRecords,
        lastTemperature: lastRecord ? lastRecord.temperature : null,
        lastTimestamp: lastRecord ? toDate(lastRecord.timestamp) : null,
      };
    })
    .sort((a, b) => {
      if (b.anomalyCount !== a.anomalyCount) return b.anomalyCount - a.anomalyCount;
      if (a.complianceRate !== b.complianceRate) return a.complianceRate - b.complianceRate;
      return a.equipmentName.localeCompare(b.equipmentName);
    });
}

export function computeMonthInvoiceCount(invoices: Invoice[], monthDate = new Date()): number {
  const monthStart = startOfMonth(monthDate).getTime();
  const nextMonthStart = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).getTime();
  return invoices.filter((invoice) => {
    const ts = toDate(invoice.invoiceDate).getTime();
    return ts >= monthStart && ts < nextMonthStart;
  }).length;
}
