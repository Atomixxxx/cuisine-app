import { expect, test } from '@playwright/test';

test.describe('PWA install prompt', () => {
  test('shows prompt then persists dismissal', async ({ page }) => {
    const installBanner = page.getByText('Installer CuisineControl');

    const dispatchInstallPrompt = async () => {
      await page.evaluate(() => {
        const evt = new Event('beforeinstallprompt') as Event & {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
        };
        Object.defineProperty(evt, 'prompt', {
          value: () => Promise.resolve(),
        });
        Object.defineProperty(evt, 'userChoice', {
          value: Promise.resolve({ outcome: 'dismissed' as const }),
        });
        window.dispatchEvent(evt);
      });
    };

    await page.goto('/dashboard');
    await page.evaluate(() => {
      localStorage.removeItem('cuisine_pwa_install_dismissed');
    });
    await page.reload();
    await page.waitForTimeout(300);

    for (let i = 0; i < 3; i += 1) {
      await dispatchInstallPrompt();
      try {
        await expect(installBanner).toBeVisible({ timeout: 1200 });
        break;
      } catch {
        if (i === 2) throw new Error('PWA banner not visible after prompt dispatch');
      }
    }

    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(installBanner).toBeHidden();

    await page.reload();

    await page.waitForTimeout(300);
    await dispatchInstallPrompt();

    await expect(installBanner).toBeHidden();
  });
});
