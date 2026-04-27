import { Router } from 'express';
import User from '../models/User.js';
import {
  stripe,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_MODE,
  isStripeConfigured,
} from '../services/stripe.js';
import {
  PLANS,
  getPlan,
  getStripePriceId,
  getPlanIdByStripePriceId,
  DEFAULT_PLAN_ID,
} from '../../../shared/plans.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('stripe');

// =============================================================================
// Public router — webhook only. Mounted BEFORE express.json() so the raw body
// is preserved for signature verification.
// =============================================================================
export const publicStripeRouter = Router();

publicStripeRouter.post('/', async (req, res) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'stripe_not_configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  if (STRIPE_WEBHOOK_SECRET) {
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      log.warn({ msg: err.message }, 'webhook signature verification failed');
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    // Dev fallback when no secret is configured. NEVER rely on this in prod.
    try {
      event = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).send('Webhook Error: invalid JSON');
    }
  }

  const rlog = (req.log || log).child({ eventId: event.id, eventType: event.type });
  rlog.info('stripe webhook received');

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object, rlog);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await onSubscriptionUpserted(event.data.object, rlog);
        break;
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(event.data.object, rlog);
        break;
      default:
        rlog.debug('unhandled event type — ignoring');
    }
    res.json({ received: true });
  } catch (err) {
    rlog.error(errContext(err), 'stripe webhook handler failed');
    // Return 500 so Stripe retries. Signature passed, so this is a DB issue.
    res.status(500).json({ error: 'webhook_handler_failed' });
  }
});

// =============================================================================
// Auth router — checkout + billing portal. Mounted AFTER express.json() with
// requireAuth middleware.
// =============================================================================
const router = Router();

// POST /api/stripe/create-checkout-session
// Body: { planId: 'premium'|'unlimited', interval: 'monthly'|'yearly' }
router.post('/create-checkout-session', async (req, res) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'stripe_not_configured' });
  }

  const { planId, interval } = req.body || {};
  const rlog = (req.log || log).child({ userId: String(req.authUserId), planId, interval });

  // Validate plan. Must be public + paid + not the user's current plan.
  const plan = PLANS[planId];
  if (!plan || !plan.isPublic || !plan.pricing.requiresCheckout) {
    return res.status(400).json({ error: 'invalid_plan' });
  }
  if (!['monthly', 'yearly'].includes(interval)) {
    return res.status(400).json({ error: 'invalid_interval' });
  }

  const priceId = getStripePriceId(planId, interval, STRIPE_MODE);
  if (!priceId) {
    rlog.error({ mode: STRIPE_MODE }, 'missing stripe price id for plan/mode');
    return res.status(500).json({ error: 'stripe_price_not_configured' });
  }

  const user = await User.findById(req.authUserId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  try {
    const customerParams = user.stripeCustomerId
      ? { customer: user.stripeCustomerId }
      : { customer_email: user.email };

    // A user who has already trialed shouldn't get another trial on upgrade
    // or cross-plan switch. Stripe can't enforce this across subs, so we
    // gate it ourselves off planActivatedAt.
    const hasAlreadyTrialed = Boolean(user.planActivatedAt);
    const trialDays = hasAlreadyTrialed ? 0 : (plan.pricing.trialDays || 0);

    const subscriptionData = {
      metadata: {
        userId: String(user._id),
        planId,
      },
    };
    if (trialDays > 0) {
      subscriptionData.trial_period_days = trialDays;
      // If the card fails at trial end, cancel the sub outright instead of
      // sending the user into past_due limbo. Our webhook reverts them to free.
      subscriptionData.trial_settings = {
        end_behavior: { missing_payment_method: 'cancel' },
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...customerParams,
      success_url: `${process.env.APP_URL || 'http://localhost:5173'}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:5173'}/account?checkout=cancel`,
      client_reference_id: String(user._id),
      metadata: {
        userId: String(user._id),
        planId,
        interval,
      },
      subscription_data: subscriptionData,
      // Required so Stripe always collects card even during a trial.
      payment_method_collection: 'always',
      allow_promotion_codes: true,
    });

    rlog.info({ sessionId: session.id }, 'checkout session created');
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    rlog.error(errContext(err), 'checkout session creation failed');
    res.status(500).json({ error: 'checkout_session_failed' });
  }
});

// POST /api/stripe/create-portal-session
// Returns a one-time URL to the Stripe-hosted Billing Portal for the user.
router.post('/create-portal-session', async (req, res) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'stripe_not_configured' });
  }

  const rlog = (req.log || log).child({ userId: String(req.authUserId) });
  const user = await User.findById(req.authUserId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  if (!user.stripeCustomerId) {
    return res.status(400).json({ error: 'no_stripe_customer' });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.APP_URL || 'http://localhost:5173'}/account`,
    });
    rlog.info({ sessionId: session.id }, 'portal session created');
    res.json({ url: session.url });
  } catch (err) {
    rlog.error(errContext(err), 'portal session creation failed');
    res.status(500).json({ error: 'portal_session_failed' });
  }
});

// GET /api/stripe/subscription
// Current user's subscription snapshot. Cheap — no Stripe call, reads from DB.
router.get('/subscription', async (req, res) => {
  const user = await User.findById(req.authUserId).lean();
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  const plan = getPlan(user.plan);
  res.json({
    plan: {
      id: plan.id,
      title: plan.marketing.title,
    },
    planActivatedAt: user.planActivatedAt,
    planExpiresAt: user.planExpiresAt,
    hasStripeCustomer: Boolean(user.stripeCustomerId),
    hasActiveSubscription: Boolean(user.stripeSubscriptionId),
  });
});

export default router;

// =============================================================================
// Webhook event handlers — each must be idempotent. Stripe retries on 5xx, and
// events can arrive out of order.
// =============================================================================

// Resolve the Mongo user id for a Stripe event. Prefer metadata; fall back to
// customer lookup so ad-hoc subscriptions created in Dashboard still work.
async function resolveUserForEvent(obj) {
  const metaUserId = obj?.metadata?.userId;
  if (metaUserId) {
    const user = await User.findById(metaUserId);
    if (user) return user;
  }
  if (obj?.customer) {
    const user = await User.findOne({ stripeCustomerId: obj.customer });
    if (user) return user;
  }
  return null;
}

async function onCheckoutCompleted(session, rlog) {
  if (session.mode !== 'subscription') {
    rlog.debug({ mode: session.mode }, 'non-subscription checkout — ignoring');
    return;
  }

  const user = await resolveUserForEvent(session);
  if (!user) {
    rlog.warn({ sessionId: session.id, customerId: session.customer }, 'no user found for checkout session');
    return;
  }

  // Persist customer id on first checkout. After this the user is "linked".
  if (!user.stripeCustomerId && session.customer) {
    user.stripeCustomerId = session.customer;
  }

  // The subscription object itself drives plan + expiry. Fetch to get the
  // authoritative current_period_end and price id.
  if (session.subscription) {
    const sub = await stripe.subscriptions.retrieve(session.subscription);
    applySubscriptionToUser(user, sub);
  }

  await user.save();
  rlog.info({ userId: String(user._id), plan: user.plan }, 'user activated from checkout');
}

async function onSubscriptionUpserted(sub, rlog) {
  const user = await resolveUserForEvent(sub);
  if (!user) {
    rlog.warn({ subId: sub.id, customerId: sub.customer }, 'no user found for subscription upsert');
    return;
  }
  if (!user.stripeCustomerId && sub.customer) {
    user.stripeCustomerId = sub.customer;
  }
  applySubscriptionToUser(user, sub);
  await user.save();
  rlog.info({ userId: String(user._id), plan: user.plan, status: sub.status }, 'subscription upserted');
}

async function onSubscriptionDeleted(sub, rlog) {
  const user = await resolveUserForEvent(sub);
  if (!user) {
    rlog.warn({ subId: sub.id, customerId: sub.customer }, 'no user found for subscription deletion');
    return;
  }
  user.plan = DEFAULT_PLAN_ID;
  user.planActivatedAt = null;
  user.planExpiresAt = null;
  user.stripeSubscriptionId = null;
  await user.save();
  rlog.info({ userId: String(user._id) }, 'subscription ended — reverted to default plan');
}

// Derive the plan id from a subscription's price and apply period end as
// planExpiresAt. Shared by checkout-completed and subscription-updated paths
// so the same logic runs regardless of which event arrived first.
function applySubscriptionToUser(user, sub) {
  const priceId = sub.items?.data?.[0]?.price?.id;
  const planIdFromPrice = priceId ? getPlanIdByStripePriceId(priceId, STRIPE_MODE) : null;
  const planIdFromMeta = sub.metadata?.planId && PLANS[sub.metadata.planId]
    ? sub.metadata.planId
    : null;

  // Price-id lookup is authoritative — that's what the user is paying for.
  // Metadata is a fallback for manual dashboard subs with no known price.
  const resolvedPlanId = planIdFromPrice || planIdFromMeta;

  // Only promote the user if the sub is in an active-ish state. If past_due
  // or unpaid, hold the current plan until Stripe resolves or cancels.
  const activeStatuses = ['active', 'trialing', 'past_due'];
  if (resolvedPlanId && activeStatuses.includes(sub.status)) {
    user.plan = resolvedPlanId;
    user.planActivatedAt = user.planActivatedAt || new Date();
  }

  user.stripeSubscriptionId = sub.id;

  // Period end moved onto items[] in Stripe API 2024-12+. Fall back to the
  // legacy top-level field for older API versions or backfilled events.
  const periodEnd =
    sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ?? null;
  user.planExpiresAt = periodEnd ? new Date(periodEnd * 1000) : null;

  // If the sub is cancelled-at-period-end, overwrite planExpiresAt with the
  // actual cancel date so the client can show "downgrades on X" messaging.
  if (sub.cancel_at_period_end && sub.cancel_at) {
    user.planExpiresAt = new Date(sub.cancel_at * 1000);
  }
}

