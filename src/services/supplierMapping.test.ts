import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { resolveSupplierLine, upsertSupplierProductMapping } from './supplierMapping';
import type { Recipe } from '../types';

beforeEach(async () => {
  await db.supplierProductMappings.clear();
  await db.recipeIngredients.clear();
  await db.recipes.clear();
});

function makeRecipe(title: string): Recipe {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    title,
    portions: 1,
    salePriceHT: 10,
    createdAt: now,
    updatedAt: now,
  };
}

describe('supplier mapping resolution', () => {
  it('returns exact mapping when SKU exists', async () => {
    const template = makeRecipe('Pain Burger Maison');
    await db.recipes.add(template);
    await upsertSupplierProductMapping({
      supplierId: 'metro',
      supplierSku: 'SKU-123',
      label: 'Pate Burger Brioche',
      templateRecipeId: template.id,
      quantityRatio: 1.25,
      confidence: 1,
    });

    const match = await resolveSupplierLine({
      supplierId: 'metro',
      supplierSku: 'SKU-123',
      label: 'Random label',
    });

    expect(match).not.toBeNull();
    expect(match!.source).toBe('exact');
    expect(match!.templateRecipeId).toBe(template.id);
    expect(match!.quantityRatio).toBeCloseTo(1.25, 5);
  });

  it('returns fuzzy match when similarity is high', async () => {
    const template = makeRecipe('Pate a burger');
    await db.recipes.add(template);

    const match = await resolveSupplierLine({
      supplierId: 'pomona',
      label: 'Pate a burger',
    });

    expect(match).not.toBeNull();
    expect(match!.source).toBe('fuzzy');
    expect(match!.templateRecipeId).toBe(template.id);
    expect(match!.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('updates existing mapping when upserting with same supplier and sku', async () => {
    const templateA = makeRecipe('Template A');
    const templateB = makeRecipe('Template B');
    await db.recipes.bulkAdd([templateA, templateB]);

    await upsertSupplierProductMapping({
      supplierId: 'metro',
      supplierSku: 'SKU-456',
      label: 'Produit test',
      templateRecipeId: templateA.id,
      quantityRatio: 1,
      confidence: 0.8,
    });
    await upsertSupplierProductMapping({
      supplierId: 'metro',
      supplierSku: 'SKU-456',
      label: 'Produit test',
      templateRecipeId: templateB.id,
      quantityRatio: 2,
      confidence: 0.95,
    });

    const all = await db.supplierProductMappings.toArray();
    expect(all).toHaveLength(1);
    expect(all[0].templateRecipeId).toBe(templateB.id);
    expect(all[0].quantityRatio).toBe(2);
  });

  it('resolves global mapping when supplier is not provided', async () => {
    const template = makeRecipe('Template global');
    await db.recipes.add(template);
    await upsertSupplierProductMapping({
      label: 'Pate burger premium',
      templateRecipeId: template.id,
      quantityRatio: 1,
      confidence: 0.9,
    });

    const match = await resolveSupplierLine({
      label: 'Pate burger premium',
    });

    expect(match).not.toBeNull();
    expect(match!.source).toBe('exact');
    expect(match!.templateRecipeId).toBe(template.id);
  });
});
