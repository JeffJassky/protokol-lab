// Demo mode UI flows + the full visitor-state matrix from
// docs/blog/customer-journey.md §1.
//
// Catches the class of bugs we kept hitting manually: PREMIUM badge
// rendering inside the demo, "Upgrade to Free" modal, "Log" nav kicking
// the visitor out of demo, missing demo banner, etc.

import { test, expect } from '@playwright/test';
import { uniqueEmail, registerViaApi, PASSWORD } from './helpers.js';

async function seedTemplate(page) {
  // Idempotent — first call seeds, subsequent calls return the existing template id.
  const r = await page.request.post('/api/__test/seed-demo-template', {
    data: { compounds: ['Tirzepatide', 'Semaglutide'], days: 60 },
  });
  if (!r.ok()) throw new Error(`seed-demo-template failed: ${r.status()}`);
  return r.json();
}

async function startDemo(page) {
  // Set up demo state via API so this helper is deterministic regardless
  // of what previous tests left in the server. UI-click flow is exercised
  // by the dedicated Path A test below.
  const r = await page.request.post('/api/demo/start');
  if (!r.ok()) throw new Error(`/api/demo/start failed: ${r.status()}`);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Path A: Cold → Demo → Real account
// ---------------------------------------------------------------------------
test.describe('Path A — Cold → Demo → Real account', () => {
  test('clicks Try the demo, sees populated dashboard, signs up, lands real-authed', async ({ page }) => {
    await seedTemplate(page);

    // Cold visitor on landing → primary CTA mints a sandbox + lands them in /dashboard.
    await page.goto('/');
    await expect(page.getByRole('button', { name: /try the demo/i }).first()).toBeVisible();
    await page.getByRole('button', { name: /try the demo/i }).first().click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });

    // Demo banner is visible — signature copy from PRD §6.1.
    await expect(page.getByText(/previewing jeff's profile/i)).toBeVisible();

    // Set Up My Profile → /start
    await page.getByRole('button', { name: /set up my profile/i }).click();
    await expect(page).toHaveURL(/\/start$/);

    // Convert to a real account.
    const email = uniqueEmail('path-a');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();

    // /start lands authed users on /welcome (wizard) or /log depending on flow.
    await expect(page).toHaveURL(/\/welcome|\/log|\/dashboard/, { timeout: 10_000 });

    // Demo banner gone now that the user is real-authed-no-toggle.
    await expect(page.getByText(/previewing jeff's profile/i)).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Path B: Cold → Free signup
// ---------------------------------------------------------------------------
test.describe('Path B — Cold → Free signup (no demo)', () => {
  test('"Sign up" nav routes to /register, signup lands in /welcome', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^sign up$/i }).first().click();
    await expect(page).toHaveURL(/\/register/);

    const email = uniqueEmail('path-b');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page).toHaveURL(/\/welcome|\/log|\/$/);
  });
});

// ---------------------------------------------------------------------------
// Path D: Login (existing user)
// ---------------------------------------------------------------------------
test.describe('Path D — Existing user → Login', () => {
  test('"Sign in" nav routes to /login, login lands in app', async ({ page }) => {
    const email = uniqueEmail('path-d');
    await registerViaApi(page, email);
    // registerViaApi already authed this page context — log out first.
    await page.request.post('/api/auth/logout', {});

    await page.goto('/');
    await page.getByRole('button', { name: /^sign in$/i }).first().click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/log|\/dashboard|\/$/);
  });
});

// ---------------------------------------------------------------------------
// Path E: Authed → Toggle into demo + Reset/Exit
// ---------------------------------------------------------------------------
// TODO: rewrite for the new toggle UI. The "View Jeff's demo" badge moved
// off the corner after the Settings split (commit 6136925) and the demo
// toggle is now under the demo banner. Re-evaluate selectors once the
// retention-mode design is final.
test.describe.skip('Path E — Authed user → Toggle into demo', () => {
  test('toggle into demo, see sandbox, exit back to real data', async ({ page }) => {
    await seedTemplate(page);
    const email = uniqueEmail('path-e');
    await registerViaApi(page, email);

    await page.goto('/dashboard');

    // Corner badge offers "View Jeff's demo" (PRD §6.2 retention pattern).
    const viewDemo = page.getByRole('button', { name: /view jeff's demo|view jeff/i });
    await expect(viewDemo).toBeVisible({ timeout: 10_000 });
    await viewDemo.click();

    // After toggle, banner switches to in-demo state with Exit + Reset.
    await expect(page.getByRole('button', { name: /^exit$/i })).toBeVisible({ timeout: 10_000 });

    // Exit puts them back on real data.
    await page.getByRole('button', { name: /^exit$/i }).click();
    // Banner returns to View-Demo badge.
    await expect(page.getByRole('button', { name: /view jeff/i })).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Visitor-state matrix — CTA visibility (§3 placement convention)
// ---------------------------------------------------------------------------
test.describe('Top nav CTAs by visitor state', () => {
  test('Anon visitor: nav shows Try the demo + Sign up + Sign in', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /try the demo/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign up$/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i }).first()).toBeVisible();
    // No "Open app" CTA for anon visitors.
    await expect(page.getByRole('button', { name: /open app/i })).toHaveCount(0);
  });

  test('Anon demo: marketing nav switches to Open app', async ({ page }) => {
    await seedTemplate(page);
    await startDemo(page);

    // Navigate back to a marketing page; nav CTA should show "Open app".
    await page.goto('/pricing');
    await expect(page.getByRole('button', { name: /open app/i })).toBeVisible({ timeout: 10_000 });
    // Acquisition CTAs hidden because we already have a sandbox.
    await expect(page.getByRole('button', { name: /try the demo/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^sign up$/i })).toHaveCount(0);
  });

  test('Authed user: marketing nav shows Open app, no acquisition CTAs', async ({ page }) => {
    const email = uniqueEmail('cta-auth');
    await registerViaApi(page, email);

    await page.goto('/pricing');
    await expect(page.getByRole('button', { name: /open app/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /try the demo/i })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Regressions — bugs we hit by hand and now want to lock in
// ---------------------------------------------------------------------------
test.describe('Regressions', () => {
  test('demo dashboard does not show install/notification onboarding banner', async ({ page }) => {
    await seedTemplate(page);
    await startDemo(page);
    // OnboardingBanner copy mentions "Install" or "reminders" — must not appear.
    await expect(page.getByText(/install protokol lab/i)).toHaveCount(0);
    await expect(page.getByText(/turn on reminders/i)).toHaveCount(0);
  });

  test('demo dashboard does not show "Finish setup" install/notification checklist', async ({ page }) => {
    await seedTemplate(page);
    await startDemo(page);
    // OnboardingChecklist headline reads "Finish setup".
    await expect(page.getByText(/finish setup/i)).toHaveCount(0);
  });

  // TODO: re-target. Brand-logo click from demo now lands on /profile, not /log.
  test.skip('Log nav from demo dashboard stays in demo (does NOT push out to landing)', async ({ page }) => {
    await seedTemplate(page);
    await startDemo(page);

    await page.getByRole('link', { name: /^log$/i }).first().click();
    await expect(page).toHaveURL(/\/log/);
    // Demo banner still visible — proves we didn't lose the session.
    await expect(page.getByText(/previewing jeff's profile/i)).toBeVisible();
  });

  test('Brand logo from demo lets visitor reach marketing landing (not auto-redirected)', async ({ page }) => {
    await seedTemplate(page);
    await startDemo(page);

    // Click the brand logo (which has aria-label "Protokol Lab — home").
    await page.getByRole('link', { name: /protokol lab.*home|protokol lab/i }).first().click();
    // Should NOT auto-redirect back to /log or /dashboard.
    await expect(page).toHaveURL(/\/$/);
    // Marketing nav now offers Open app.
    await expect(page.getByRole('button', { name: /open app/i })).toBeVisible({ timeout: 10_000 });
  });

  // TODO: rename selector. The "Exit demo" button moved into the demo
  // banner overflow menu after the AppLayout refresh.
  test.skip('"Exit demo" button clears demo cookie and returns to marketing', async ({ page }) => {
    await seedTemplate(page);
    await startDemo(page);

    await page.getByRole('button', { name: /exit demo/i }).click();
    await expect(page).toHaveURL(/\/$/);
    // Acquisition CTAs reappear (no demo session, no auth).
    await expect(page.getByRole('button', { name: /try the demo/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Anon demo nav hides Settings + Support (account-only sections)', async ({ page }) => {
    await seedTemplate(page);
    await startDemo(page);

    // Log + Dashboard are present (they show sandbox data).
    await expect(page.getByRole('link', { name: /^log$/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^dashboard$/i }).first()).toBeVisible();
    // Settings + Support are hidden — they're tied to the real account.
    await expect(page.getByRole('link', { name: /^settings$/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^support$/i })).toHaveCount(0);
  });

  // TODO: re-target nav links. Settings now nests under sub-pages
  // (/settings/profile, /settings/notifications, etc.) — no top-level
  // "Settings" anchor. Update once the new IA is locked.
  test.skip('Authed user nav (no toggle) shows Settings + Support', async ({ page }) => {
    const email = uniqueEmail('nav-authed');
    await registerViaApi(page, email);
    await page.goto('/dashboard');

    await expect(page.getByRole('link', { name: /^settings$/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^support$/i }).first()).toBeVisible();
  });
});
