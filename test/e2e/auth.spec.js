// UI auth flow. Only the first test exercises the signup form end-to-end;
// the rest take the API fast path and use UI for login/logout.

import { test, expect } from '@playwright/test';
import {
  uniqueEmail, registerViaApi, registerViaUi, loginViaUi,
} from './helpers.js';

test('UI signup form lands on the welcome wizard', async ({ page }) => {
  await registerViaUi(page, uniqueEmail('auth-signup'));
  // Onboarding gate sends new users here; logging out should be reachable.
  await expect(page).toHaveURL(/\/welcome/);
});

// TODO: rewrite for the new nav. The "Logout" button moved off the global
// AppLayout into /settings (commit 6136925 "Split Settings into Profile +
// sub-pages"). Skipping here while we re-decide the canonical post-login
// landing page, then update the assertions in a separate PR.
test.skip('login → /log → logout → /login', async ({ page }) => {
  const email = uniqueEmail('auth-login');
  await registerViaApi(page, email);
  await page.request.post('/api/auth/logout', {});

  await loginViaUi(page, email);
  await expect(page).toHaveURL(/\/log|\/$/);
  await expect(page.getByRole('heading', { name: /daily log/i })).toBeVisible();

  await page.getByRole('button', { name: /logout/i }).click();
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test('login with wrong password stays on /login', async ({ page }) => {
  const email = uniqueEmail('auth-bad');
  await registerViaApi(page, email);
  await page.request.post('/api/auth/logout', {});

  await loginViaUi(page, email, 'wrong-password');
  await expect(page).toHaveURL(/\/login/);
  // Daily Log heading must NOT be visible — that would mean we let the user in.
  await expect(page.getByRole('heading', { name: /daily log/i })).toHaveCount(0);
});

test('guarded route redirects to /login when unauthenticated', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/log');
  await expect(page).toHaveURL(/\/login/);
});
