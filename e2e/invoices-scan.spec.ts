import { expect, test } from '@playwright/test';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8l0V0AAAAASUVORK5CYII=';

test.describe('Invoice scan flow', () => {
  test('imports an image in scanner mode and prepares analysis', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('gemini_api_key', 'test-key');
    });

    await page.goto('/invoices?quick=scan');

    await expect(page.getByRole('button', { name: /prendre photo/i })).toBeVisible();

    const fileBuffer = Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64');
    await page
      .locator('input[type="file"][accept="image/*"][capture="environment"]')
      .setInputFiles({
        name: 'invoice-e2e.png',
        mimeType: 'image/png',
        buffer: fileBuffer,
      });

    await expect(page.getByText(/Pages capturees \(1\)/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /analyser \(1 page\)/i })).toBeVisible();
  });
});
