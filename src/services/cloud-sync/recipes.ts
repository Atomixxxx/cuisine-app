import type { Ingredient, Recipe, RecipeIngredient } from '../../types';
import { deleteRows, fetchRows, upsertRows } from '../supabaseRest';
import { toDate, toIsoDate, withWorkspaceFilter, SUPABASE_WORKSPACE_ID } from './core';

interface IngredientRow {
  workspace_id: string;
  id: string;
  name: string;
  unit: Ingredient['unit'];
  unit_price: number;
  conditioning_quantity?: number | null;
  supplier_id?: string | null;
}

interface RecipeRow {
  workspace_id: string;
  id: string;
  title: string;
  portions: number;
  sale_price_ht: number;
  created_at: string;
  updated_at: string;
  allergens: string[];
}

interface RecipeIngredientRow {
  workspace_id: string;
  id: string;
  recipe_id: string;
  ingredient_id: string;
  required_quantity: number;
  required_unit: RecipeIngredient['requiredUnit'];
}

function toIngredientRow(value: Ingredient): IngredientRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    name: value.name,
    unit: value.unit,
    unit_price: value.unitPrice,
    conditioning_quantity: value.conditioningQuantity ?? null,
    supplier_id: value.supplierId ?? null,
  };
}

function fromIngredientRow(value: IngredientRow): Ingredient {
  return {
    id: value.id,
    name: value.name,
    unit: value.unit,
    unitPrice: value.unit_price,
    conditioningQuantity: value.conditioning_quantity ?? undefined,
    supplierId: value.supplier_id ?? undefined,
  };
}

function toRecipeRow(value: Recipe): RecipeRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    title: value.title,
    portions: value.portions,
    sale_price_ht: value.salePriceHT,
    created_at: toIsoDate(value.createdAt),
    updated_at: toIsoDate(value.updatedAt),
    allergens: value.allergens ?? [],
  };
}

function fromRecipeRow(value: RecipeRow): Recipe {
  return {
    id: value.id,
    title: value.title,
    portions: value.portions,
    salePriceHT: value.sale_price_ht,
    createdAt: toDate(value.created_at),
    updatedAt: toDate(value.updated_at),
    allergens: value.allergens ?? [],
  };
}

function toRecipeIngredientRow(value: RecipeIngredient): RecipeIngredientRow {
  return {
    workspace_id: SUPABASE_WORKSPACE_ID,
    id: value.id,
    recipe_id: value.recipeId,
    ingredient_id: value.ingredientId,
    required_quantity: value.requiredQuantity,
    required_unit: value.requiredUnit,
  };
}

function fromRecipeIngredientRow(value: RecipeIngredientRow): RecipeIngredient {
  return {
    id: value.id,
    recipeId: value.recipe_id,
    ingredientId: value.ingredient_id,
    requiredQuantity: value.required_quantity,
    requiredUnit: value.required_unit,
  };
}

export async function fetchRemoteIngredients(): Promise<Ingredient[]> {
  const rows = await fetchRows<IngredientRow>('ingredients', {
    filters: withWorkspaceFilter(),
    order: 'name.asc',
  });
  return rows.map(fromIngredientRow);
}

export async function upsertRemoteIngredient(value: Ingredient): Promise<void> {
  await upsertRows<IngredientRow>('ingredients', [toIngredientRow(value)], 'workspace_id,id');
}

export async function deleteRemoteIngredient(id: string): Promise<void> {
  await deleteRows('ingredients', withWorkspaceFilter([{ column: 'id', op: 'eq', value: id }]));
}

export async function fetchRemoteRecipes(): Promise<Recipe[]> {
  const rows = await fetchRows<RecipeRow>('recipes', {
    filters: withWorkspaceFilter(),
    order: 'updated_at.desc',
  });
  return rows.map(fromRecipeRow);
}

export async function fetchRemoteRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]> {
  const rows = await fetchRows<RecipeIngredientRow>('recipe_ingredients', {
    filters: withWorkspaceFilter([{ column: 'recipe_id', op: 'eq', value: recipeId }]),
    order: 'id.asc',
  });
  return rows.map(fromRecipeIngredientRow);
}

export async function upsertRemoteRecipe(value: Recipe): Promise<void> {
  await upsertRows<RecipeRow>('recipes', [toRecipeRow(value)], 'workspace_id,id');
}

export async function replaceRemoteRecipeIngredients(recipeId: string, lines: RecipeIngredient[]): Promise<void> {
  await deleteRows('recipe_ingredients', withWorkspaceFilter([{ column: 'recipe_id', op: 'eq', value: recipeId }]));
  if (lines.length === 0) return;
  await upsertRows<RecipeIngredientRow>(
    'recipe_ingredients',
    lines.map(toRecipeIngredientRow),
    'workspace_id,id',
  );
}

export async function deleteRemoteRecipe(recipeId: string): Promise<void> {
  await deleteRows('recipes', withWorkspaceFilter([{ column: 'id', op: 'eq', value: recipeId }]));
  await deleteRows('recipe_ingredients', withWorkspaceFilter([{ column: 'recipe_id', op: 'eq', value: recipeId }]));
}
