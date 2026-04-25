// Landing page smoke + primary CTA routes. Cheapest signal that the full
// stack (server + Vite + prerendered HTML if served) is up.

import { test, expect } from '@playwright/test';

test.describe('landing page', () => {
  test('loads and primary CTA routes to /register', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toContainText(/start tracking/i);

    await page.getByRole('button', { name: /start tracking/i }).first().click();
    // Some CTAs append plan/interval params; we just need /register.
    await expect(page).toHaveURL(/\/register(\?|$)/);
  });

  test('Sign in nav routes to /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
