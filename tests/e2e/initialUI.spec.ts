import { test, expect } from '@playwright/test';

test.describe('Initial UI & Loading', () => {
  test('loads without uncaught console errors and renders clean empty state', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    // Check Branding & Header controls
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('header').getByText('Luna Player')).toBeVisible();
    await expect(page.locator('header').getByText('Local Video Player')).toBeVisible();
    await expect(page.getByTestId('settings-button')).toBeVisible();
    await expect(page.getByTestId('theme-toggle-button')).toBeVisible();

    // Check Empty State Hero Card & Open Videos split control
    await expect(page.getByRole('heading', { name: 'Luna Player', level: 2 })).toBeVisible();
    await expect(
      page.getByText(/open a local video folder to discover movies/i)
    ).toBeVisible();

    const heroOpenBtn = page.getByTestId('open-videos-button');
    await expect(heroOpenBtn).toBeVisible();
    await expect(heroOpenBtn).toHaveText(/open videos/i);

    const openMenuBtn = page.getByTestId('open-videos-menu-button');
    await expect(openMenuBtn).toBeVisible();
    await openMenuBtn.click();
    await expect(page.getByTestId('empty-state-menu-open-folder')).toBeVisible();
    await expect(page.getByTestId('empty-state-menu-open-files')).toBeVisible();
    await page.keyboard.press('Escape');

    // Check feature cards
    await expect(page.getByText('100% Private')).toBeVisible();
    await expect(page.getByText('Nested Folders')).toBeVisible();
    await expect(page.getByText('Resume & Next')).toBeVisible();

    // Ensure no uncaught JS runtime errors on initial load
    expect(consoleErrors).toEqual([]);
  });
});
