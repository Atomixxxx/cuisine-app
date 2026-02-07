import { describe, expect, it } from 'vitest';
import { generateRecipeTemplateFromLine } from './recipeAi';

describe('recipe AI generator', () => {
  it('falls back to local template when no api key is configured', async () => {
    const template = await generateRecipeTemplateFromLine('Pate a burger 1kg');

    expect(template.title.length).toBeGreaterThan(0);
    expect(template.ingredients.length).toBeGreaterThan(0);
    expect(template.ingredients.some((line) => line.name.toLowerCase().includes('farine'))).toBe(true);
  });
});
