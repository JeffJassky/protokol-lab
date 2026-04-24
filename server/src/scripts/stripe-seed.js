#!/usr/bin/env node
// Idempotent Stripe seeder for paid plans.
//
// For every plan in shared/plans.js that has `requiresCheckout`, ensure a
// product exists and monthly+yearly recurring prices match the USD amounts
// declared there. Prices are immutable in Stripe; if an existing price's
// amount/interval/currency drifted from plans.js, a new price is created and
// the old one archived.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_test_... node server/src/scripts/stripe-seed.js
//   STRIPE_SECRET_KEY=sk_live_... node server/src/scripts/stripe-seed.js
//
// Mode is derived from the key prefix. The script prints a JSON snippet ready
// to paste into the matching `pricing.stripe.<mode>` block of shared/plans.js.
//
// Safe to re-run. No-ops when everything is already in sync.

import 'dotenv/config';
import Stripe from 'stripe';
import {
  PLANS,
  resolveStripeMode,
  getStripeIds,
} from '../../../shared/plans.js';

const API_VERSION = '2024-12-18.acacia';
const CURRENCY = 'usd';
const PLAN_METADATA_KEY = 'protokolPlanId';

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('STRIPE_SECRET_KEY is required');
  process.exit(1);
}

const mode = resolveStripeMode(secretKey);
const stripe = new Stripe(secretKey, { apiVersion: API_VERSION });

console.log(`\nStripe seed — mode: ${mode}\n`);

function toCents(usd) {
  return Math.round(usd * 100);
}

// Find a product by (1) known id from plans.js, (2) metadata tag, or null.
// Archived products are skipped so a previously deleted plan gets recreated.
async function findProduct(plan, knownProductId) {
  if (knownProductId) {
    try {
      const p = await stripe.products.retrieve(knownProductId);
      if (p.active) return p;
    } catch (err) {
      if (err.code !== 'resource_missing') throw err;
    }
  }
  // Metadata search — works even if the id was never checked in.
  const results = await stripe.products.search({
    query: `metadata['${PLAN_METADATA_KEY}']:'${plan.id}' AND active:'true'`,
    limit: 1,
  });
  return results.data[0] || null;
}

async function upsertProduct(plan, knownProductId) {
  const existing = await findProduct(plan, knownProductId);
  const desiredName = plan.marketing.title;
  const desiredDescription = plan.marketing.tagline;

  if (existing) {
    const needsUpdate =
      existing.name !== desiredName ||
      existing.description !== desiredDescription ||
      existing.metadata?.[PLAN_METADATA_KEY] !== plan.id;
    if (needsUpdate) {
      const updated = await stripe.products.update(existing.id, {
        name: desiredName,
        description: desiredDescription,
        metadata: { ...existing.metadata, [PLAN_METADATA_KEY]: plan.id },
      });
      console.log(`  product ${plan.id}: updated (${existing.id})`);
      return updated;
    }
    console.log(`  product ${plan.id}: reused (${existing.id})`);
    return existing;
  }

  const created = await stripe.products.create({
    name: desiredName,
    description: desiredDescription,
    metadata: { [PLAN_METADATA_KEY]: plan.id },
  });
  console.log(`  product ${plan.id}: created (${created.id})`);
  return created;
}

// Return an existing price that still matches desired shape, or null. A
// mismatch means we need a new price because Stripe forbids mutating amount
// or interval on an existing one.
async function findMatchingPrice(knownPriceId, product, { unitAmount, interval }) {
  if (knownPriceId) {
    try {
      const price = await stripe.prices.retrieve(knownPriceId);
      const matches =
        price.active &&
        price.product === product.id &&
        price.currency === CURRENCY &&
        price.unit_amount === unitAmount &&
        price.recurring?.interval === interval;
      if (matches) return price;
    } catch (err) {
      if (err.code !== 'resource_missing') throw err;
    }
  }
  // Fall back to listing prices on the product for a match — covers the
  // case where plans.js was wiped but Stripe already has the right price.
  const list = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  return (
    list.data.find(
      (p) =>
        p.currency === CURRENCY &&
        p.unit_amount === unitAmount &&
        p.recurring?.interval === interval,
    ) || null
  );
}

async function upsertPrice(plan, product, interval, knownPriceId) {
  const usd = interval === 'year' ? plan.pricing.yearlyUsd : plan.pricing.monthlyUsd;
  if (usd == null) return null;

  const unitAmount = toCents(usd);
  const match = await findMatchingPrice(knownPriceId, product, { unitAmount, interval });
  if (match) {
    console.log(`  price ${plan.id}/${interval}: reused (${match.id}) @ $${usd}`);
    return match;
  }

  // Archive drifted price before creating the replacement so lookups don't
  // pick up the stale one. Only archive when it belongs to this product.
  if (knownPriceId) {
    try {
      const stale = await stripe.prices.retrieve(knownPriceId);
      if (stale.active && stale.product === product.id) {
        await stripe.prices.update(knownPriceId, { active: false });
        console.log(`  price ${plan.id}/${interval}: archived stale ${knownPriceId}`);
      }
    } catch (err) {
      if (err.code !== 'resource_missing') throw err;
    }
  }

  const created = await stripe.prices.create({
    product: product.id,
    currency: CURRENCY,
    unit_amount: unitAmount,
    recurring: { interval },
    metadata: { [PLAN_METADATA_KEY]: plan.id, interval },
  });
  console.log(`  price ${plan.id}/${interval}: created (${created.id}) @ $${usd}`);
  return created;
}

async function seedPlan(plan) {
  console.log(`\nplan: ${plan.id} — ${plan.marketing.title}`);
  const known = getStripeIds(plan.id, mode);

  const product = await upsertProduct(plan, known.productId);
  const monthly = await upsertPrice(plan, product, 'month', known.priceIdMonthly);
  const yearly = await upsertPrice(plan, product, 'year', known.priceIdYearly);

  return {
    planId: plan.id,
    ids: {
      productId: product.id,
      priceIdMonthly: monthly?.id || null,
      priceIdYearly: yearly?.id || null,
    },
  };
}

async function main() {
  const paidPlans = Object.values(PLANS).filter((p) => p.pricing.requiresCheckout);
  const results = [];
  for (const plan of paidPlans) {
    results.push(await seedPlan(plan));
  }

  console.log(`\n— paste into shared/plans.js under pricing.stripe.${mode} —`);
  for (const r of results) {
    console.log(`\n// ${r.planId}`);
    console.log(JSON.stringify(r.ids, null, 2));
  }
  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('\nstripe seed failed:', err.message);
  if (err.raw) console.error(err.raw);
  process.exit(1);
});
