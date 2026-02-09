import { expect, test } from '@playwright/test';

test.describe('Navigation smoke', () => {
  test('switches main tabs', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'CuisineControl' })).toBeVisible();

    await page.getByRole('tab', { name: /Temp\.|Controles|Contrôles/i }).click();
    await expect(page).toHaveURL(/\/temperature/);

    await page.getByRole('tab', { name: 'Taches' }).click();
    await expect(page).toHaveURL(/\/tasks/);

    await page.getByRole('tab', { name: 'Factures' }).click();
    await expect(page).toHaveURL(/\/invoices/);

    await page.getByRole('tab', { name: 'Accueil' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
