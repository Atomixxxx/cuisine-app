import { describe, expect, it } from 'vitest';
import { computeRecipeCostFromLines } from './recipeCost';
import type { Ingredient } from '../types';

describe('recipeCost', () => {
  it('converts grams to kilograms when ingredient is priced per kg', () => {
    const flour: Ingredient = {
      id: 'i1',
      name: 'Farine',
      unit: 'kg',
      unitPrice: 2,
    };
    const map = new Map([[flour.id, flour]]);
    const summary = computeRecipeCostFromLines(
      [{ ingredientId: 'i1', requiredQuantity: 500, requiredUnit: 'g' }],
      map,
      10,
    );

    expect(summary.totalCost).toBeCloseTo(1, 5);
    expect(summary.grossMargin).toBeCloseTo(9, 5);
    expect(summary.foodCostRate).toBeCloseTo(0.1, 5);
    expect(summary.warningLevel).toBe('ok');
  });

  it('marks food cost as danger above 30%', () => {
    const ingredient: Ingredient = {
      id: 'i2',
      name: 'Saumon',
      unit: 'kg',
      unitPrice: 18,
    };
    const map = new Map([[ingredient.id, ingredient]]);
    const summary = computeRecipeCostFromLines(
      [{ ingredientId: 'i2', requiredQuantity: 400, requiredUnit: 'g' }],
      map,
      15,
    );

    expect(summary.totalCost).toBeCloseTo(7.2, 5);
    expect(summary.foodCostRate).toBeGreaterThan(0.3);
    expect(summary.warningLevel).toBe('danger');
  });
});
