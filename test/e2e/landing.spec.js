// Landing page smoke + primary CTA routes. Cheapest signal that the full
// stack (server + Vite + prerendered HTML if served) is up.
//
// Hero CTAs per docs/blog/customer-journey.md §3:
//   primary  "Try the demo →"  → mints a sandbox + lands on /dashboard
//   secondary "Sign up"        → /register
//   tertiary "Sign in"         → /login

import { test, expect } from '@playwright/test';

test.describe('landing page', () => {
  test('loads with the hero "Try the demo" primary CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /try the demo/i }).first()).toBeVisible();
  });

  test('"Sign up" hero CTA routes to /register', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^sign up$/i }).first().click();
    await expect(page).toHaveURL(/\/register(\?|$)/);
  });

  test('"Sign in" hero CTA routes to /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});
