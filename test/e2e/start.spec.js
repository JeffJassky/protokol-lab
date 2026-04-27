// /start signup flow. Guards against the gating regression we hit when
// /start required compound + dose + dose-date — that blocked non-peptide
// users from creating an account. Now /start should accept email +
// password and route to the /welcome wizard, where peptide setup lives
// behind StepCompounds (skippable). See plans/demo-mode.md §9.

import { test, expect } from '@playwright/test';
import { uniqueEmail, PASSWORD } from './helpers.js';

test('/start signup is email + password only and lands on /welcome', async ({ page }) => {
  await page.goto('/start');

  // Compound + dose fields must NOT exist — that's the regression we're guarding.
  await expect(page.getByLabel(/compound/i)).toHaveCount(0);
  await expect(page.getByLabel(/most recent dose/i)).toHaveCount(0);
  await expect(page.getByLabel(/^date$/i)).toHaveCount(0);

  await page.getByLabel('Email').fill(uniqueEmail('start-signup'));
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/welcome/);
});
