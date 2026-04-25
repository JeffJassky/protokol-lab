// Log a weight through the UI and verify it appears on the same page.
// Onboarding is skipped via API so we land on /log directly.

import { test, expect } from '@playwright/test';
import { uniqueEmail, registerViaApi } from './helpers.js';

test('user can log a weight entry from /log', async ({ page }) => {
  await registerViaApi(page, uniqueEmail('weight'));
  await page.goto('/log');
  await expect(page.getByRole('heading', { name: /daily log/i })).toBeVisible();

  const weightInput = page.getByPlaceholder('lbs').first();
  await weightInput.fill('183.4');

  // The lbs input is inside a small form; scope the "Log" button to that
  // form to avoid clicking the waist/dose log buttons.
  const weightForm = page
    .locator('form', { has: page.getByPlaceholder('lbs').first() })
    .first();
  await weightForm.getByRole('button', { name: /^log$/i }).click();

  await expect(page.locator('body')).toContainText('183.4 lbs');
});
