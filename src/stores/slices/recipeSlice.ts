import type { StateCreator } from 'zustand';
import { db } from '../../services/db';
import {
  deleteRemoteIngredient,
  deleteRemoteRecipe,
  fetchRemoteIngredients,
  fetchRemoteRecipeIngredients,
  fetchRemoteRecipes,
  replaceRemoteRecipeIngredients,
  upsertRemoteIngredient,
  upsertRemoteRecipe,
} from '../../services/cloudSync';
import { sanitize } from '../../utils';
import type { AppState } from '../appStore';
import { runCloudRead, runCloudTask } from './cloudUtils';
import { sanitizeAllergens } from './sliceUtils';
import { computeAutoRecipeAllergens, mergeRecipeAllergens } from '../../services/recipeAllergens';
import type { Ingredient } from '../../types';

type RecipeSlice = Pick<
  AppState,
  | 'getIngredients'
  | 'addIngredient'
  | 'updateIngredient'
  | 'deleteIngredient'
  | 'getRecipes'
  | 'getRecipeIngredients'
  | 'saveRecipeWithIngredients'
  | 'deleteRecipe'
>;

function toIngredientMap(values: Array<Ingredient | undefined>): Map<string, Ingredient> {
  const map = new Map<string, Ingredient>();
  for (const value of values) {
    if (!value) continue;
    map.set(value.id, value);
  }
  return map;
}

export const createRecipeSlice: StateCreator<AppState, [], [], RecipeSlice> = () => ({
  getIngredients: async () => {
    const remoteIngredients = await runCloudRead('ingredients:list', fetchRemoteIngredients);
    if (remoteIngredients) {
      if (remoteIngredients.length > 0) {
        await db.ingredients.clear();
        await db.ingredients.bulkPut(remoteIngredients);
      } else {
        const localIngredients = await db.ingredients.orderBy('name').toArray();
        if (localIngredients.length > 0) {
          await runCloudTask('ingredients:seed', async () => {
            for (const item of localIngredients) await upsertRemoteIngredient(item);
          });
          return localIngredients;
        }
      }
      return remoteIngredients;
    }
    return db.ingredients.orderBy('name').toArray();
  },

  addIngredient: async (ingredient) => {
    const payload = {
      ...ingredient,
      name: sanitize(ingredient.name),
      supplierId: ingredient.supplierId ? sanitize(ingredient.supplierId) : undefined,
    };
    await db.ingredients.add(payload);
    await runCloudTask('ingredients:add', async () => {
      await upsertRemoteIngredient(payload);
    });
  },

  updateIngredient: async (ingredient) => {
    const payload = {
      ...ingredient,
      name: sanitize(ingredient.name),
      supplierId: ingredient.supplierId ? sanitize(ingredient.supplierId) : undefined,
    };
    await db.ingredients.put(payload);
    await runCloudTask('ingredients:update', async () => {
      await upsertRemoteIngredient(payload);
    });
  },

  deleteIngredient: async (id) => {
    await db.ingredients.delete(id);
    await db.recipeIngredients.where('ingredientId').equals(id).delete();
    await runCloudTask('ingredients:delete', async () => {
      await deleteRemoteIngredient(id);
    });
  },

  getRecipes: async () => {
    const remoteRecipes = await runCloudRead('recipes:list', fetchRemoteRecipes);
    if (remoteRecipes) {
      if (remoteRecipes.length > 0) {
        await db.recipes.clear();
        await db.recipes.bulkPut(remoteRecipes);
      } else {
        const localRecipes = await db.recipes.orderBy('updatedAt').reverse().toArray();
        if (localRecipes.length > 0) {
          await runCloudTask('recipes:seed', async () => {
            for (const recipe of localRecipes) await upsertRemoteRecipe(recipe);
          });
          return localRecipes;
        }
      }
      return remoteRecipes;
    }
    return db.recipes.orderBy('updatedAt').reverse().toArray();
  },

  getRecipeIngredients: async (recipeId) => {
    const remoteLines = await runCloudRead('recipe-ingredients:list', async () =>
      fetchRemoteRecipeIngredients(recipeId),
    );
    if (remoteLines) {
      if (remoteLines.length === 0) {
        const localLines = await db.recipeIngredients.where('recipeId').equals(recipeId).toArray();
        if (localLines.length > 0) {
          await runCloudTask('recipe-ingredients:seed', async () => {
            await replaceRemoteRecipeIngredients(recipeId, localLines);
          });
          return localLines;
        }
      }
      await db.recipeIngredients.where('recipeId').equals(recipeId).delete();
      if (remoteLines.length > 0) await db.recipeIngredients.bulkPut(remoteLines);
      return remoteLines;
    }
    return db.recipeIngredients.where('recipeId').equals(recipeId).toArray();
  },

  saveRecipeWithIngredients: async (recipe, lines) => {
    const sanitizedLines = lines.map((line) => ({
      ...line,
      requiredQuantity: Math.max(0, line.requiredQuantity),
    }));

    const ingredientIds = Array.from(
      new Set(sanitizedLines.map((line) => line.ingredientId).filter(Boolean)),
    );
    const linkedIngredients = ingredientIds.length > 0 ? await db.ingredients.bulkGet(ingredientIds) : [];
    const ingredientMap = toIngredientMap(linkedIngredients);
    const autoDetectedAllergens = computeAutoRecipeAllergens(ingredientIds, ingredientMap);
    const manualAllergens = sanitizeAllergens(recipe.allergens) ?? [];
    const mergedAllergens = mergeRecipeAllergens(autoDetectedAllergens, manualAllergens);

    const sanitizedRecipe = {
      ...recipe,
      title: sanitize(recipe.title),
      allergens: mergedAllergens.length > 0 ? mergedAllergens : undefined,
    };

    await db.transaction('rw', db.recipes, db.recipeIngredients, async () => {
      await db.recipes.put(sanitizedRecipe);
      await db.recipeIngredients.where('recipeId').equals(sanitizedRecipe.id).delete();
      if (sanitizedLines.length > 0) {
        await db.recipeIngredients.bulkAdd(sanitizedLines);
      }
    });

    await runCloudTask('recipes:save', async () => {
      await upsertRemoteRecipe(sanitizedRecipe);
      await replaceRemoteRecipeIngredients(sanitizedRecipe.id, sanitizedLines);
    });
  },

  deleteRecipe: async (recipeId) => {
    await db.transaction('rw', db.recipes, db.recipeIngredients, async () => {
      await db.recipes.delete(recipeId);
      await db.recipeIngredients.where('recipeId').equals(recipeId).delete();
    });
    await runCloudTask('recipes:delete', async () => {
      await deleteRemoteRecipe(recipeId);
    });
  },
});
