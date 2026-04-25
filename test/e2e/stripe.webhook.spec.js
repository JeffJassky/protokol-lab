// End-to-end Stripe subscription lifecycle via the raw webhook endpoint.
//
// Why E2E on top of unit coverage: unit tests mock Stripe at the module
// boundary; this exercises the real Express pipeline (raw body parser,
// signature-skip dev path, Mongo write, /api/auth/me read).
//
// STRIPE_WEBHOOK_SECRET is intentionally unset in playwright.config.js so the
// route falls through to the dev JSON path (server/src/routes/stripe.js:41-48)
// and accepts unsigned payloads — the dev-only code path documented there.

import { test, expect } from '@playwright/test';
import { uniqueEmail, registerViaApi } from './helpers.js';

const PREMIUM_MONTHLY_PRICE_TEST = 'price_1TPmoYEbNm7I4te2Cvi8vu2Q';
const SERVER_BASE = 'http://localhost:3002';

async function fireWebhook(page, event) {
  const res = await page.request.post(`${SERVER_BASE}/api/stripe/webhook`, {
    headers: { 'content-type': 'application/json' },
    data: event,
  });
  expect(res.status()).toBe(200);
}

test('subscription.updated promotes user to premium', async ({ page }) => {
  const user = await registerViaApi(page, uniqueEmail('stripe-up'));

  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  await fireWebhook(page, {
    id: `evt_e2e_${Date.now()}`,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: `sub_e2e_${Date.now()}`,
        object: 'subscription',
        customer: `cus_e2e_${Date.now()}`,
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: periodEnd,
        metadata: { userId: user.id, planId: 'premium' },
        items: { data: [{ price: { id: PREMIUM_MONTHLY_PRICE_TEST }, current_period_end: periodEnd }] },
      },
    },
  });

  const after = await (await page.request.get('/api/auth/me')).json();
  expect(after.user.plan).toBe('premium');
  expect(after.user.hasActiveSubscription).toBe(true);
});

test('subscription.deleted reverts user to free', async ({ page }) => {
  const user = await registerViaApi(page, uniqueEmail('stripe-cancel'));

  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  const subId = `sub_cancel_${Date.now()}`;
  const customerId = `cus_cancel_${Date.now()}`;

  await fireWebhook(page, {
    id: `evt_upsert_${Date.now()}`,
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: subId,
        customer: customerId,
        status: 'active',
        current_period_end: periodEnd,
        metadata: { userId: user.id, planId: 'premium' },
        items: { data: [{ price: { id: PREMIUM_MONTHLY_PRICE_TEST }, current_period_end: periodEnd }] },
      },
    },
  });
  const mid = await (await page.request.get('/api/auth/me')).json();
  expect(mid.user.plan).toBe('premium');

  await fireWebhook(page, {
    id: `evt_del_${Date.now()}`,
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: subId,
        customer: customerId,
        metadata: { userId: user.id, planId: 'premium' },
        items: { data: [] },
      },
    },
  });

  const after = await (await page.request.get('/api/auth/me')).json();
  expect(after.user.plan).toBe('free');
  expect(after.user.hasActiveSubscription).toBe(false);
});
