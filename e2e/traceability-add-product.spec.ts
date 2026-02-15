import { expect, test } from '@playwright/test';

test.describe('Traceability product flow', () => {
  test('creates a product from manual scanner continuation', async ({ page }) => {
    const productName = `Produit E2E ${Date.now()}`;

    await page.goto('/traceability?tab=scanner&quick=scan');

    // Step 1: skip barcode, go to photo step
    await page.getByRole('button', { name: /photo etiquette/i }).click();
    // Step 2: skip photo, continue to form
    await page.getByRole('button', { name: /continuer/i }).click();

    await page.getByPlaceholder(/filet de saumon/i).fill(productName);
    await page.getByPlaceholder(/pomona/i).fill('Metro');
    await page.getByPlaceholder(/lot-2024/i).fill('LOT-E2E');
    await page.locator('input[type="date"]').nth(1).fill('2030-12-31');

    await page.getByRole('button', { name: /enregistrer/i }).click();

    await page.getByRole('button', { name: /historique/i }).click();

    await expect(page.getByText(productName)).toBeVisible();
  });
});
