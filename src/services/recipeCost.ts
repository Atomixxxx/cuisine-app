import { db } from './db';
import type { Ingredient, RecipeCostSummary, RecipeUnit } from '../types';

export interface RecipeCostInputLine {
  ingredientId: string;
  requiredQuantity: number;
  requiredUnit: RecipeUnit;
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

export function computeRecipeCostFromLines(
  lines: RecipeCostInputLine[],
  ingredientMap: Map<string, Ingredient>,
  salePriceHT: number,
): RecipeCostSummary {
  const totalCost = lines.reduce((sum, line) => {
    const ingredient = ingredientMap.get(line.ingredientId);
    if (!ingredient) return sum;

    const convertedQty = convertQuantity(line.requiredQuantity, line.requiredUnit, ingredient.unit);
    if (convertedQty === null) return sum;
    if (!Number.isFinite(convertedQty) || convertedQty < 0) return sum;

    return sum + convertedQty * ingredient.unitPrice;
  }, 0);

  const safeSalePrice = Number.isFinite(salePriceHT) && salePriceHT > 0 ? salePriceHT : 0;
  const foodCostRate = safeSalePrice > 0 ? totalCost / safeSalePrice : 0;
  const grossMargin = safeSalePrice - totalCost;

  let warningLevel: RecipeCostSummary['warningLevel'] = 'ok';
  if (foodCostRate > 0.3) warningLevel = 'danger';
  else if (foodCostRate > 0.25) warningLevel = 'warning';

  return { totalCost, grossMargin, foodCostRate, warningLevel };
}

export async function calculateRecipeCost(recipeId: string): Promise<RecipeCostSummary> {
  const recipe = await db.recipes.get(recipeId);
  if (!recipe) {
    return {
      totalCost: 0,
      grossMargin: 0,
      foodCostRate: 0,
      warningLevel: 'ok',
    };
  }

  const [links, ingredients] = await Promise.all([
    db.recipeIngredients.where('recipeId').equals(recipeId).toArray(),
    db.ingredients.toArray(),
  ]);
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  return computeRecipeCostFromLines(
    links.map((line) => ({
      ingredientId: line.ingredientId,
      requiredQuantity: line.requiredQuantity,
      requiredUnit: line.requiredUnit,
    })),
    ingredientMap,
    recipe.salePriceHT,
  );
}
