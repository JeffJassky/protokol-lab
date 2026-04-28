// @synthetic specs run in three places (see docs/testing.md):
//   1. CI e2e against ephemeral mem-mongo — gates merges + deploys.
//   2. Post-deploy smoke against live prod (.github/workflows/deploy.yml).
//   3. Hourly cron against live prod (.github/workflows/synthetic.yml).
//
// Anything in this file MUST work without relying on /api/__test/* helpers
// when running in prod mode — those endpoints are gated to NODE_ENV=e2e.
// We branch on PROD_SYNTHETIC: in CI we seed the demo template via the
// helper; in prod we trust that the template is already there.
//
// Keep specs deterministic and zero-side-effect. Demo sandboxes are
// isolated by design and auto-clean via the demo cleanup cron.

import { test, expect } from '@playwright/test';

const IS_PROD = process.env.PROD_SYNTHETIC === '1';

// In CI, seed the demo template before each test so the demo flow has data
// to clone. In prod it's already seeded — skip.
test.beforeEach(async ({ page }) => {
  if (IS_PROD) return;
  const r = await page.request.post('/api/__test/seed-demo-template', {
    data: { compounds: ['Tirzepatide'], days: 30 },
  });
  if (!r.ok()) throw new Error(`seed-demo-template failed: ${r.status()}`);
});

test('@synthetic landing page renders the primary demo CTA', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: /try the demo/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
});

test('@synthetic demo flow takes an anon visitor into a sandbox', async ({ page }) => {
  // CI cold-boot can take 20s+ for the Vite dev server to compile + hydrate
  // the post-click route on first visit. Bump the per-test budget so a
  // single slow first run doesn't trip the smoke check.
  test.setTimeout(60_000);

  await page.goto('/');
  await page.getByRole('button', { name: /try the demo/i }).first().click();

  // Demo banner is the load-bearing assertion: it only renders inside a
  // demo sandbox, regardless of which app route the click lands on (the
  // specific destination — /dashboard vs /profile vs /log — has shifted
  // with the Settings/Profile IA work and isn't stable enough to assert).
  await expect(page.getByText(/previewing jeff's profile/i)).toBeVisible({ timeout: 30_000 });
});
