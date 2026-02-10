import { expect, test } from '@playwright/test';

test.describe('Recipes flow', () => {
  test('creates a recipe manually from the creation wizard', async ({ page }) => {
    const recipeName = `Recette E2E ${Date.now()}`;

    await page.goto('/recipes');

    const emptyStateCreateButton = page.getByRole('button', { name: /creer une fiche/i });
    if (await emptyStateCreateButton.count()) {
      await emptyStateCreateButton.first().click();
    } else {
      await page.getByRole('button', { name: /nouvelle fiche/i }).click();
    }

    await page.getByRole('button', { name: /creer manuellement/i }).click();

    await page.getByPlaceholder(/ex: burger maison/i).fill(recipeName);
    await page.locator('input[type="number"]').first().fill('2');
    await page.locator('input[type="number"]').nth(1).fill('12');

    await page.getByRole('button', { name: /enregistrer la fiche/i }).click();

    await expect(page.getByText(recipeName)).toBeVisible();
  });
});
