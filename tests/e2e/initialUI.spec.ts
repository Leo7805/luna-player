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

    // Check Branding in Header
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('header').getByText('Luna Player')).toBeVisible();
    await expect(page.locator('header').getByText(/v1\.[01]/)).toBeVisible();

    // Check Open Folder button in Header and Hero
    const headerOpenBtn = page.locator('header').getByRole('button', { name: /open folder/i });
    await expect(headerOpenBtn).toBeVisible();

    // Check Empty State Hero Card
    await expect(page.getByRole('heading', { name: 'Luna Player', level: 2 })).toBeVisible();
    await expect(
      page.getByText(/open a local video folder to discover movies/i)
    ).toBeVisible();

    const heroOpenBtn = page.getByRole('button', { name: /open video folder/i });
    await expect(heroOpenBtn).toBeVisible();

    // Check feature cards
    await expect(page.getByText('100% Private')).toBeVisible();
    await expect(page.getByText('Nested Folders')).toBeVisible();
    await expect(page.getByText('Resume & Next')).toBeVisible();

    // Ensure no uncaught JS runtime errors on initial load
    expect(consoleErrors).toEqual([]);
  });
});
