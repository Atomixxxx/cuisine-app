import { expect, test } from '@playwright/test';

test.describe('PIN lock flow', () => {
  test('unlocks app with legacy PIN migration', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cuisine_pin_code', '1234');
      localStorage.removeItem('cuisine_pin_hash');
      localStorage.removeItem('cuisine_pin_salt');
      localStorage.removeItem('cuisine_pin_unlocked');
    });

    await page.goto('/dashboard');

    await expect(page.getByText('Entrez votre PIN')).toBeVisible();

    await page.getByRole('button', { name: '1' }).click();
    await page.getByRole('button', { name: '2' }).click();
    await page.getByRole('button', { name: '3' }).click();
    await page.getByRole('button', { name: '4' }).click();

    await expect(page.getByText('Entrez votre PIN')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
