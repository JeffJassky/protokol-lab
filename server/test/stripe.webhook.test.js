// Stripe webhook integration tests.
//
// Strategy:
//   - Global mock in test/setup.js replaces src/services/stripe.js with a stub
//     whose `webhooks.constructEvent` and `subscriptions.retrieve` are vi.fn()s.
//   - Per test we set what constructEvent returns (the canned Stripe event) and
//     what subscriptions.retrieve returns when checkout.session.completed needs
//     to fetch the sub.
//   - We POST raw JSON to /api/stripe/webhook with a dummy `stripe-signature`
//     header. The route uses express.raw() so the body must be a Buffer.
//
// What we verify:
//   - checkout.session.completed links User.stripeCustomerId, sets plan, period.
//   - customer.subscription.updated promotes to premium when sub is active.
//   - customer.subscription.updated with past_due keeps plan but updates status fields.
//   - customer.subscription.deleted reverts user to free + clears subscription id.
//   - Idempotency: replaying the same event leaves User state unchanged.
//   - Unknown customer yields 200 + no-op (Stripe would retry otherwise).
//   - Signature failure from constructEvent returns 400.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import { stripe } from '../src/services/stripe.js';
import { PLAN_IDS, getStripePriceId } from '../../shared/plans.js';

const app = createApp({ serveClient: false });

const PREMIUM_MONTHLY_PRICE = getStripePriceId(PLAN_IDS.PREMIUM, 'monthly', 'test');
const UNLIMITED_MONTHLY_PRICE = getStripePriceId(PLAN_IDS.UNLIMITED, 'monthly', 'test');

async function makeUser(overrides = {}) {
  return User.create({
    email: `u-${Math.random().toString(36).slice(2, 8)}@example.com`,
    passwordHash: 'x',
    ...overrides,
  });
}

function postWebhook(event) {
  stripe.webhooks.constructEvent.mockReturnValueOnce(event);
  return request(app)
    .post('/api/stripe/webhook')
    .set('stripe-signature', 't=1,v1=fake')
    .set('content-type', 'application/json')
    .send(Buffer.from(JSON.stringify(event)));
}

// Canned Stripe event factories. Shape matches what Stripe actually sends
// in API 2024-12+ for these event types; only fields the handler reads.
function subscriptionObject({
  id = 'sub_test_123',
  customer = 'cus_test_123',
  userId,
  planId = 'premium',
  priceId = PREMIUM_MONTHLY_PRICE,
  status = 'active',
  periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400,
  cancelAtPeriodEnd = false,
  cancelAt = null,
} = {}) {
  return {
    id,
    object: 'subscription',
    customer,
    status,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancel_at: cancelAt,
    current_period_end: periodEnd,
    metadata: { userId: String(userId || ''), planId },
    items: {
      data: [
        { price: { id: priceId }, current_period_end: periodEnd },
      ],
    },
  };
}

function checkoutEvent({ user, sessionId = 'cs_test_1', customerId = 'cus_test_1', subId = 'sub_test_1' }) {
  return {
    id: `evt_${sessionId}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        mode: 'subscription',
        customer: customerId,
        subscription: subId,
        client_reference_id: String(user._id),
        metadata: { userId: String(user._id), planId: 'premium', interval: 'monthly' },
      },
    },
  };
}

describe('POST /api/stripe/webhook — signature verification', () => {
  it('returns 400 when constructEvent throws', async () => {
    stripe.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error('No signatures found matching the expected signature');
    });
    const res = await request(app)
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'garbage')
      .set('content-type', 'application/json')
      .send(Buffer.from('{}'));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/stripe/webhook — checkout.session.completed', () => {
  it('links customer id, sets plan to premium, sets period end', async () => {
    const user = await makeUser();
    const sub = subscriptionObject({ userId: user._id });
    stripe.subscriptions.retrieve.mockResolvedValueOnce(sub);

    const res = await postWebhook(checkoutEvent({
      user,
      customerId: sub.customer,
      subId: sub.id,
    }));
    expect(res.status).toBe(200);

    const fresh = await User.findById(user._id);
    expect(fresh.stripeCustomerId).toBe(sub.customer);
    expect(fresh.stripeSubscriptionId).toBe(sub.id);
    expect(fresh.plan).toBe(PLAN_IDS.PREMIUM);
    expect(fresh.planActivatedAt).toBeInstanceOf(Date);
    expect(fresh.planExpiresAt.getTime()).toBe(sub.current_period_end * 1000);
  });

  it('ignores non-subscription checkout sessions', async () => {
    const user = await makeUser();
    const evt = checkoutEvent({ user });
    evt.data.object.mode = 'payment';

    const res = await postWebhook(evt);
    expect(res.status).toBe(200);

    const fresh = await User.findById(user._id);
    expect(fresh.plan).toBe(PLAN_IDS.FREE);
    expect(fresh.stripeCustomerId).toBeNull();
    expect(stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('idempotent: replaying the same event does not duplicate state', async () => {
    const user = await makeUser();
    const sub = subscriptionObject({ userId: user._id });
    stripe.subscriptions.retrieve.mockResolvedValue(sub);

    const evt = checkoutEvent({ user, customerId: sub.customer, subId: sub.id });
    await postWebhook(evt);
    const afterFirst = await User.findById(user._id);

    await postWebhook(evt);
    const afterSecond = await User.findById(user._id);

    expect(afterSecond.plan).toBe(afterFirst.plan);
    expect(afterSecond.stripeCustomerId).toBe(afterFirst.stripeCustomerId);
    expect(afterSecond.stripeSubscriptionId).toBe(afterFirst.stripeSubscriptionId);
    expect(afterSecond.planActivatedAt.getTime()).toBe(afterFirst.planActivatedAt.getTime());
  });

  it('no-op when user cannot be resolved (metadata missing + unknown customer)', async () => {
    const sub = subscriptionObject({ userId: '' });
    sub.customer = 'cus_unknown_999';
    stripe.subscriptions.retrieve.mockResolvedValueOnce(sub);

    const evt = {
      id: 'evt_orphan',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_orphan',
          mode: 'subscription',
          customer: 'cus_unknown_999',
          subscription: 'sub_orphan',
          metadata: {},
        },
      },
    };
    const res = await postWebhook(evt);
    expect(res.status).toBe(200);
    const users = await User.find({});
    expect(users).toHaveLength(0);
  });
});

describe('POST /api/stripe/webhook — customer.subscription.updated', () => {
  it('promotes user to unlimited when active sub with unlimited price arrives', async () => {
    const user = await makeUser();
    const sub = subscriptionObject({
      userId: user._id,
      priceId: UNLIMITED_MONTHLY_PRICE,
      planId: 'unlimited',
    });
    const res = await postWebhook({
      id: 'evt_sub_upd',
      type: 'customer.subscription.updated',
      data: { object: sub },
    });
    expect(res.status).toBe(200);

    const fresh = await User.findById(user._id);
    expect(fresh.plan).toBe(PLAN_IDS.UNLIMITED);
    expect(fresh.stripeSubscriptionId).toBe(sub.id);
  });

  it('keeps user on premium when sub goes past_due', async () => {
    const user = await makeUser({ plan: PLAN_IDS.PREMIUM, planActivatedAt: new Date() });
    const sub = subscriptionObject({ userId: user._id, status: 'past_due' });
    const res = await postWebhook({
      id: 'evt_sub_past_due',
      type: 'customer.subscription.updated',
      data: { object: sub },
    });
    expect(res.status).toBe(200);

    const fresh = await User.findById(user._id);
    // past_due is still in active set — plan stays premium.
    expect(fresh.plan).toBe(PLAN_IDS.PREMIUM);
    expect(fresh.stripeSubscriptionId).toBe(sub.id);
  });

  it('does not promote user when status is incomplete', async () => {
    const user = await makeUser();
    const sub = subscriptionObject({ userId: user._id, status: 'incomplete' });
    await postWebhook({
      id: 'evt_sub_incomplete',
      type: 'customer.subscription.updated',
      data: { object: sub },
    });

    const fresh = await User.findById(user._id);
    expect(fresh.plan).toBe(PLAN_IDS.FREE);
    // But we still persist the sub id so later events can resolve the user.
    expect(fresh.stripeSubscriptionId).toBe(sub.id);
  });

  it('uses cancel_at as planExpiresAt when cancel_at_period_end is true', async () => {
    const user = await makeUser();
    const cancelAt = Math.floor(Date.now() / 1000) + 14 * 86400;
    const sub = subscriptionObject({
      userId: user._id,
      cancelAtPeriodEnd: true,
      cancelAt,
    });
    await postWebhook({
      id: 'evt_sub_cancel_scheduled',
      type: 'customer.subscription.updated',
      data: { object: sub },
    });

    const fresh = await User.findById(user._id);
    expect(fresh.planExpiresAt.getTime()).toBe(cancelAt * 1000);
  });

  it('resolves user by customer id when metadata missing', async () => {
    const user = await makeUser({ stripeCustomerId: 'cus_metaless_1' });
    const sub = subscriptionObject({ customer: 'cus_metaless_1' });
    sub.metadata = {};
    await postWebhook({
      id: 'evt_sub_by_customer',
      type: 'customer.subscription.updated',
      data: { object: sub },
    });

    const fresh = await User.findById(user._id);
    expect(fresh.plan).toBe(PLAN_IDS.PREMIUM);
  });
});

describe('POST /api/stripe/webhook — customer.subscription.deleted', () => {
  it('reverts user to free and clears subscription id', async () => {
    const user = await makeUser({
      plan: PLAN_IDS.PREMIUM,
      planActivatedAt: new Date(),
      planExpiresAt: new Date(Date.now() + 1e9),
      stripeCustomerId: 'cus_del_1',
      stripeSubscriptionId: 'sub_del_1',
    });
    const sub = subscriptionObject({ id: 'sub_del_1', customer: 'cus_del_1', userId: user._id });
    const res = await postWebhook({
      id: 'evt_sub_deleted',
      type: 'customer.subscription.deleted',
      data: { object: sub },
    });
    expect(res.status).toBe(200);

    const fresh = await User.findById(user._id);
    expect(fresh.plan).toBe(PLAN_IDS.FREE);
    expect(fresh.planActivatedAt).toBeNull();
    expect(fresh.planExpiresAt).toBeNull();
    expect(fresh.stripeSubscriptionId).toBeNull();
    // customer id persists so we can re-attach on future checkouts.
    expect(fresh.stripeCustomerId).toBe('cus_del_1');
  });

  it('no-op when user unknown', async () => {
    const sub = subscriptionObject({ id: 'sub_orphan', customer: 'cus_ghost' });
    sub.metadata = {};
    const res = await postWebhook({
      id: 'evt_orphan_del',
      type: 'customer.subscription.deleted',
      data: { object: sub },
    });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/stripe/webhook — unknown event types', () => {
  it('returns 200 and ignores unhandled types', async () => {
    const res = await postWebhook({
      id: 'evt_unknown',
      type: 'ping',
      data: { object: {} },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
