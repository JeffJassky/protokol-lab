import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import ChatUsage from '../models/ChatUsage.js';
import FunnelEvent from '../models/FunnelEvent.js';
import { FUNNEL_STEPS } from '../lib/funnelEvents.js';
import {
  getEffectiveChatLimits,
  getEffectivePlanFeatures,
  getQuotaWindows,
  getPlanForUser,
} from '../lib/planLimits.js';
import { stripe, isStripeConfigured } from '../services/stripe.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('admin');
const router = Router();

function parseWindow(req) {
  const rawDays = Number.parseInt(req.query.days, 10);
  const days = Number.isFinite(rawDays)
    ? Math.min(Math.max(rawDays, 1), 365)
    : 30;
  const endAt = new Date();
  const startAt = new Date(endAt.getTime() - days * 24 * 60 * 60 * 1000);
  return { days, startAt, endAt };
}

function parseLimit(req, def = 50, max = 500) {
  const raw = Number.parseInt(req.query.limit, 10);
  if (!Number.isFinite(raw)) return def;
  return Math.min(Math.max(raw, 1), max);
}

// GET /api/admin/usage?days=30&limit=50
// Overview: global totals, top users by cost, daily breakdown.
router.get('/usage', async (req, res) => {
  const rlog = req.log || log;
  const { days, startAt, endAt } = parseWindow(req);
  const limit = parseLimit(req);

  try {
    const [result] = await ChatUsage.aggregate([
      { $match: { createdAt: { $gte: startAt, $lte: endAt } } },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                messages: { $sum: 1 },
                inputTokens: { $sum: '$inputTokens' },
                outputTokens: { $sum: '$outputTokens' },
                totalTokens: { $sum: '$totalTokens' },
                searchCalls: { $sum: '$searchCalls' },
                costUsd: { $sum: '$totalCostUsd' },
                errors: { $sum: { $cond: [{ $ne: ['$status', 'ok'] }, 1, 0] } },
                users: { $addToSet: '$userId' },
              },
            },
            {
              $project: {
                _id: 0,
                messages: 1,
                inputTokens: 1,
                outputTokens: 1,
                totalTokens: 1,
                searchCalls: 1,
                costUsd: 1,
                errors: 1,
                users: { $size: '$users' },
              },
            },
          ],
          byUser: [
            {
              $group: {
                _id: '$userId',
                messages: { $sum: 1 },
                inputTokens: { $sum: '$inputTokens' },
                outputTokens: { $sum: '$outputTokens' },
                costUsd: { $sum: '$totalCostUsd' },
                errors: { $sum: { $cond: [{ $ne: ['$status', 'ok'] }, 1, 0] } },
                lastActiveAt: { $max: '$createdAt' },
              },
            },
            { $sort: { costUsd: -1 } },
            { $limit: limit },
            {
              $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'user',
              },
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                userId: '$_id',
                email: '$user.email',
                plan: '$user.plan',
                messages: 1,
                inputTokens: 1,
                outputTokens: 1,
                costUsd: 1,
                errors: 1,
                lastActiveAt: 1,
              },
            },
          ],
          byDay: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: '%Y-%m-%d',
                    date: '$createdAt',
                    timezone: 'UTC',
                  },
                },
                messages: { $sum: 1 },
                costUsd: { $sum: '$totalCostUsd' },
                users: { $addToSet: '$userId' },
              },
            },
            {
              $project: {
                _id: 0,
                date: '$_id',
                messages: 1,
                costUsd: 1,
                users: { $size: '$users' },
              },
            },
            { $sort: { date: 1 } },
          ],
        },
      },
    ]);

    const totals = result?.totals?.[0] || {
      messages: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      searchCalls: 0,
      costUsd: 0,
      errors: 0,
      users: 0,
    };

    rlog.info(
      { days, users: totals.users, messages: totals.messages, costUsd: totals.costUsd },
      'admin: usage overview',
    );

    res.json({
      window: {
        days,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      },
      totals,
      byUser: result?.byUser || [],
      byDay: result?.byDay || [],
    });
  } catch (err) {
    rlog.error({ ...errContext(err) }, 'admin: usage aggregate failed');
    res.status(500).json({ error: 'usage_query_failed' });
  }
});

// GET /api/admin/usage/users/:userId?days=30
// Drill-down: one user's limits, current-window usage, recent messages.
router.get('/usage/users/:userId', async (req, res) => {
  const rlog = req.log || log;
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'invalid_user_id' });
  }

  const user = await User.findById(userId).select('-passwordHash').lean();
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const { days, startAt, endAt } = parseWindow(req);
  const recentLimit = parseLimit(req, 50, 200);
  const windows = getQuotaWindows();
  const uid = new mongoose.Types.ObjectId(userId);

  try {
    const [[windowResult], [liveResult], recentRows] = await Promise.all([
      ChatUsage.aggregate([
        { $match: { userId: uid, createdAt: { $gte: startAt, $lte: endAt } } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  messages: { $sum: 1 },
                  inputTokens: { $sum: '$inputTokens' },
                  outputTokens: { $sum: '$outputTokens' },
                  totalTokens: { $sum: '$totalTokens' },
                  searchCalls: { $sum: '$searchCalls' },
                  costUsd: { $sum: '$totalCostUsd' },
                  errors: { $sum: { $cond: [{ $ne: ['$status', 'ok'] }, 1, 0] } },
                },
              },
            ],
            byDay: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$createdAt',
                      timezone: 'UTC',
                    },
                  },
                  messages: { $sum: 1 },
                  costUsd: { $sum: '$totalCostUsd' },
                  inputTokens: { $sum: '$inputTokens' },
                  outputTokens: { $sum: '$outputTokens' },
                },
              },
              { $project: { _id: 0, date: '$_id', messages: 1, costUsd: 1, inputTokens: 1, outputTokens: 1 } },
              { $sort: { date: 1 } },
            ],
          },
        },
      ]),
      ChatUsage.aggregate([
        { $match: { userId: uid, createdAt: { $gte: windows.startOfMonth } } },
        {
          $facet: {
            today: [
              { $match: { createdAt: { $gte: windows.startOfDay } } },
              {
                $group: {
                  _id: null,
                  messages: { $sum: 1 },
                  inputTokens: { $sum: '$inputTokens' },
                  outputTokens: { $sum: '$outputTokens' },
                  costUsd: { $sum: '$totalCostUsd' },
                },
              },
            ],
            month: [
              {
                $group: {
                  _id: null,
                  messages: { $sum: 1 },
                  costUsd: { $sum: '$totalCostUsd' },
                },
              },
            ],
          },
        },
      ]),
      ChatUsage.find({ userId: uid })
        .sort({ createdAt: -1 })
        .limit(recentLimit)
        .lean(),
    ]);

    const firstOrEmpty = (arr) => (Array.isArray(arr) && arr[0]) || {};
    const totals = firstOrEmpty(windowResult?.totals);
    const usageNow = {
      today: firstOrEmpty(liveResult?.today),
      month: firstOrEmpty(liveResult?.month),
    };

    const plan = getPlanForUser(user);

    res.json({
      user: {
        id: String(user._id),
        email: user.email,
        plan: user.plan,
        planActivatedAt: user.planActivatedAt,
        planExpiresAt: user.planExpiresAt,
        limitsOverride: user.limitsOverride,
        isAdmin: Boolean(user.isAdmin),
        createdAt: user.createdAt,
      },
      plan: { id: plan.id, title: plan.marketing.title },
      currentLimits: getEffectiveChatLimits(user),
      currentFeatures: getEffectivePlanFeatures(user),
      usageNow,
      window: {
        days,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      },
      totals: {
        messages: totals.messages || 0,
        inputTokens: totals.inputTokens || 0,
        outputTokens: totals.outputTokens || 0,
        totalTokens: totals.totalTokens || 0,
        searchCalls: totals.searchCalls || 0,
        costUsd: totals.costUsd || 0,
        errors: totals.errors || 0,
      },
      byDay: windowResult?.byDay || [],
      recentMessages: recentRows.map((r) => ({
        id: String(r._id),
        createdAt: r.createdAt,
        threadId: r.threadId ? String(r.threadId) : null,
        model: r.model,
        planAtTime: r.planAtTime,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        totalTokens: r.totalTokens,
        costUsd: r.totalCostUsd,
        iterations: r.iterations,
        toolCalls: r.toolCalls,
        searchCalls: r.searchCalls,
        durationMs: r.durationMs,
        status: r.status,
        errorMessage: r.errorMessage,
      })),
    });
  } catch (err) {
    rlog.error({ ...errContext(err), userId }, 'admin: user usage failed');
    res.status(500).json({ error: 'user_usage_query_failed' });
  }
});

// PATCH /api/admin/users/:userId/plan  { plan, limitsOverride }
// Minimal control surface to move a user between tiers or set per-user
// overrides without going through Stripe. Useful for comps and testing.
router.patch('/users/:userId/plan', async (req, res) => {
  const rlog = req.log || log;
  const { userId } = req.params;
  const { plan, limitsOverride, planExpiresAt } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'invalid_user_id' });
  }

  const update = {};
  if (plan !== undefined) {
    update.plan = plan;
    update.planActivatedAt = new Date();
  }
  if (limitsOverride !== undefined) update.limitsOverride = limitsOverride;
  if (planExpiresAt !== undefined) {
    update.planExpiresAt = planExpiresAt ? new Date(planExpiresAt) : null;
  }

  if (!Object.keys(update).length) {
    return res.status(400).json({ error: 'nothing_to_update' });
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true },
  )
    .select('-passwordHash')
    .lean();

  if (!user) return res.status(404).json({ error: 'user_not_found' });

  rlog.info(
    { targetUserId: userId, fields: Object.keys(update), newPlan: user.plan },
    'admin: user plan updated',
  );

  res.json({
    user: {
      id: String(user._id),
      email: user.email,
      plan: user.plan,
      planActivatedAt: user.planActivatedAt,
      planExpiresAt: user.planExpiresAt,
      limitsOverride: user.limitsOverride,
      isAdmin: Boolean(user.isAdmin),
    },
  });
});

// =============================================================================
// Users admin surface — list + per-user detail including Stripe billing data.
// =============================================================================

// GET /api/admin/users?q=&plan=&page=1&limit=50
// DB-only list with 30-day chat activity rollup per user. Fast; no Stripe.
router.get('/users', async (req, res) => {
  const rlog = req.log || log;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const planFilter = typeof req.query.plan === 'string' ? req.query.plan : '';
  const limit = parseLimit(req, 50, 500);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const skip = (page - 1) * limit;

  const filter = {};
  if (q) {
    filter.email = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  if (planFilter) filter.plan = planFilter;

  try {
    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-passwordHash')
        .lean(),
      User.countDocuments(filter),
    ]);

    const userIds = users.map((u) => u._id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const usageRows = userIds.length
      ? await ChatUsage.aggregate([
          {
            $match: {
              userId: { $in: userIds },
              createdAt: { $gte: thirtyDaysAgo },
            },
          },
          {
            $group: {
              _id: '$userId',
              messages: { $sum: 1 },
              costUsd: { $sum: '$totalCostUsd' },
              lastActiveAt: { $max: '$createdAt' },
            },
          },
        ])
      : [];

    const usageByUser = new Map(usageRows.map((r) => [String(r._id), r]));

    res.json({
      users: users.map((u) => {
        const usage = usageByUser.get(String(u._id));
        return {
          id: String(u._id),
          email: u.email,
          plan: u.plan,
          planActivatedAt: u.planActivatedAt,
          planExpiresAt: u.planExpiresAt,
          hasStripeCustomer: Boolean(u.stripeCustomerId),
          hasActiveSubscription: Boolean(u.stripeSubscriptionId),
          hasLimitsOverride: Boolean(u.limitsOverride),
          isAdmin: Boolean(u.isAdmin),
          createdAt: u.createdAt,
          chat30d: {
            messages: usage?.messages || 0,
            costUsd: usage?.costUsd || 0,
            lastActiveAt: usage?.lastActiveAt || null,
          },
        };
      }),
      page,
      limit,
      total,
      hasMore: skip + users.length < total,
    });
  } catch (err) {
    rlog.error({ ...errContext(err) }, 'admin: list users failed');
    res.status(500).json({ error: 'list_users_failed' });
  }
});

// GET /api/admin/users/:userId
// Full drill-down: user profile, plan + live limits, chat rollups + recent
// messages, Stripe customer + subscriptions + invoices + charges + LTV.
// Stripe fetches run in parallel and fail soft — a Stripe outage must not
// mask the user/chat data an admin is trying to investigate.
router.get('/users/:userId', async (req, res) => {
  const rlog = req.log || log;
  const { userId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'invalid_user_id' });
  }

  const user = await User.findById(userId).select('-passwordHash').lean();
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  const { days, startAt, endAt } = parseWindow(req);
  const uid = new mongoose.Types.ObjectId(userId);
  const windows = getQuotaWindows();

  try {
    const [chatWindowRes, chatNowRes, recentRows, stripeData, recentEvents] = await Promise.all([
      ChatUsage.aggregate([
        { $match: { userId: uid, createdAt: { $gte: startAt, $lte: endAt } } },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  messages: { $sum: 1 },
                  inputTokens: { $sum: '$inputTokens' },
                  outputTokens: { $sum: '$outputTokens' },
                  totalTokens: { $sum: '$totalTokens' },
                  searchCalls: { $sum: '$searchCalls' },
                  costUsd: { $sum: '$totalCostUsd' },
                  errors: { $sum: { $cond: [{ $ne: ['$status', 'ok'] }, 1, 0] } },
                },
              },
            ],
            byDay: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$createdAt',
                      timezone: 'UTC',
                    },
                  },
                  messages: { $sum: 1 },
                  costUsd: { $sum: '$totalCostUsd' },
                  inputTokens: { $sum: '$inputTokens' },
                  outputTokens: { $sum: '$outputTokens' },
                },
              },
              {
                $project: {
                  _id: 0,
                  date: '$_id',
                  messages: 1,
                  costUsd: 1,
                  inputTokens: 1,
                  outputTokens: 1,
                },
              },
              { $sort: { date: 1 } },
            ],
          },
        },
      ]),
      ChatUsage.aggregate([
        { $match: { userId: uid, createdAt: { $gte: windows.startOfMonth } } },
        {
          $facet: {
            today: [
              { $match: { createdAt: { $gte: windows.startOfDay } } },
              {
                $group: {
                  _id: null,
                  messages: { $sum: 1 },
                  inputTokens: { $sum: '$inputTokens' },
                  outputTokens: { $sum: '$outputTokens' },
                  costUsd: { $sum: '$totalCostUsd' },
                },
              },
            ],
            month: [
              {
                $group: {
                  _id: null,
                  messages: { $sum: 1 },
                  costUsd: { $sum: '$totalCostUsd' },
                },
              },
            ],
          },
        },
      ]),
      ChatUsage.find({ userId: uid })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      fetchStripeDataForUser(user).catch((err) => {
        rlog.warn({ err: err.message, userId }, 'admin: stripe fetch failed');
        return { error: err.message || 'stripe_fetch_failed' };
      }),
      // Funnel timeline — most recent events tied to this user, either
      // emitted while authenticated or backfilled at register time via
      // anonId stitching. Capped to keep payloads small.
      FunnelEvent.find({ userId: uid })
        .sort({ ts: -1 })
        .limit(50)
        .lean(),
    ]);

    const firstOr = (arr) => (Array.isArray(arr) && arr[0]) || {};
    const chatWindow = chatWindowRes[0] || {};
    const chatNow = chatNowRes[0] || {};
    const totals = firstOr(chatWindow?.totals);
    const plan = getPlanForUser(user);

    res.json({
      user: {
        id: String(user._id),
        email: user.email,
        plan: user.plan,
        planActivatedAt: user.planActivatedAt,
        planExpiresAt: user.planExpiresAt,
        limitsOverride: user.limitsOverride,
        isAdmin: Boolean(user.isAdmin),
        createdAt: user.createdAt,
        stripeCustomerId: user.stripeCustomerId || null,
        stripeSubscriptionId: user.stripeSubscriptionId || null,
      },
      plan: { id: plan.id, title: plan.marketing.title },
      currentLimits: getEffectiveChatLimits(user),
      currentFeatures: getEffectivePlanFeatures(user),
      usageNow: {
        today: firstOr(chatNow?.today),
        month: firstOr(chatNow?.month),
      },
      window: {
        days,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      },
      chatTotals: {
        messages: totals.messages || 0,
        inputTokens: totals.inputTokens || 0,
        outputTokens: totals.outputTokens || 0,
        totalTokens: totals.totalTokens || 0,
        searchCalls: totals.searchCalls || 0,
        costUsd: totals.costUsd || 0,
        errors: totals.errors || 0,
      },
      chatByDay: chatWindow?.byDay || [],
      recentMessages: recentRows.map((r) => ({
        id: String(r._id),
        createdAt: r.createdAt,
        threadId: r.threadId ? String(r.threadId) : null,
        model: r.model,
        planAtTime: r.planAtTime,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        totalTokens: r.totalTokens,
        costUsd: r.totalCostUsd,
        iterations: r.iterations,
        toolCalls: r.toolCalls,
        searchCalls: r.searchCalls,
        durationMs: r.durationMs,
        status: r.status,
        errorMessage: r.errorMessage,
      })),
      stripe: stripeData,
      funnelEvents: recentEvents.map((e) => ({
        id: String(e._id),
        name: e.name,
        ts: e.ts,
        path: e.path,
        props: e.props,
        utm: {
          source: e.utmSource,
          medium: e.utmMedium,
          campaign: e.utmCampaign,
        },
      })),
    });
  } catch (err) {
    rlog.error({ ...errContext(err), userId }, 'admin: user detail failed');
    res.status(500).json({ error: 'user_detail_failed' });
  }
});

// POST /api/admin/users/:userId/stripe-sync
// Pull fresh subscription state from Stripe and apply it to the user. Useful
// when a webhook was missed or manually recovering after config changes.
router.post('/users/:userId/stripe-sync', async (req, res) => {
  const rlog = req.log || log;
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'invalid_user_id' });
  }
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'stripe_not_configured' });
  }

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  if (!user.stripeCustomerId) {
    return res.status(400).json({ error: 'no_stripe_customer' });
  }

  try {
    const subs = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'all',
      limit: 10,
    });
    // Pick the most recent active-ish sub; fall back to most recent.
    const preferred = subs.data.find((s) =>
      ['active', 'trialing', 'past_due'].includes(s.status),
    ) || subs.data[0];
    if (!preferred) {
      return res.json({ ok: true, applied: false, reason: 'no_subscriptions' });
    }
    // Inline minimal version of routes/stripe.js#applySubscriptionToUser. Kept
    // local to avoid exporting webhook internals.
    const { getPlanIdByStripePriceId, PLANS, DEFAULT_PLAN_ID } = await import(
      '../../../shared/plans.js'
    );
    const { STRIPE_MODE } = await import('../services/stripe.js');
    const priceId = preferred.items?.data?.[0]?.price?.id;
    const planIdFromPrice = priceId
      ? getPlanIdByStripePriceId(priceId, STRIPE_MODE)
      : null;
    const planIdFromMeta =
      preferred.metadata?.planId && PLANS[preferred.metadata.planId]
        ? preferred.metadata.planId
        : null;
    const resolvedPlanId = planIdFromPrice || planIdFromMeta;

    if (['active', 'trialing', 'past_due'].includes(preferred.status) && resolvedPlanId) {
      user.plan = resolvedPlanId;
      user.planActivatedAt = user.planActivatedAt || new Date();
    } else if (preferred.status === 'canceled') {
      user.plan = DEFAULT_PLAN_ID;
      user.planActivatedAt = null;
    }
    user.stripeSubscriptionId = preferred.id;
    user.planExpiresAt = preferred.current_period_end
      ? new Date(preferred.current_period_end * 1000)
      : null;
    if (preferred.cancel_at_period_end && preferred.cancel_at) {
      user.planExpiresAt = new Date(preferred.cancel_at * 1000);
    }
    await user.save();
    rlog.info(
      { userId: String(user._id), plan: user.plan, subStatus: preferred.status },
      'admin: stripe sync applied',
    );
    res.json({
      ok: true,
      applied: true,
      plan: user.plan,
      subscriptionStatus: preferred.status,
    });
  } catch (err) {
    rlog.error({ ...errContext(err), userId }, 'admin: stripe sync failed');
    res.status(500).json({ error: 'stripe_sync_failed' });
  }
});

// Fetch Stripe customer + subs + invoices + charges in one shot. Returns null
// if the user has no Stripe customer yet. All Stripe responses are trimmed to
// the fields the admin UI actually needs.
async function fetchStripeDataForUser(user) {
  if (!user.stripeCustomerId) return null;
  if (!isStripeConfigured()) return { error: 'stripe_not_configured' };

  const [customer, subsList, invoicesList, chargesList] = await Promise.all([
    stripe.customers.retrieve(user.stripeCustomerId),
    stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'all',
      limit: 10,
    }),
    stripe.invoices.list({ customer: user.stripeCustomerId, limit: 100 }),
    stripe.charges.list({ customer: user.stripeCustomerId, limit: 20 }),
  ]);

  const paidInvoices = invoicesList.data.filter((i) => i.status === 'paid');
  const lifetimeRevenueUsd =
    paidInvoices.reduce((s, i) => s + (i.amount_paid || 0), 0) / 100;
  const mrrUsd = subsList.data
    .filter((s) => ['active', 'trialing'].includes(s.status))
    .reduce((sum, s) => {
      const item = s.items?.data?.[0]?.price;
      if (!item) return sum;
      const amount = (item.unit_amount || 0) / 100;
      // Normalize to monthly. Yearly subs divide by 12.
      const intervalCount = item.recurring?.interval_count || 1;
      const interval = item.recurring?.interval || 'month';
      const perMonth =
        interval === 'year'
          ? amount / (12 * intervalCount)
          : interval === 'week'
            ? (amount * 52) / 12 / intervalCount
            : amount / intervalCount;
      return sum + perMonth;
    }, 0);

  return {
    customer: {
      id: customer.id,
      email: customer.email,
      balanceUsd: (customer.balance || 0) / 100,
      currency: customer.currency,
      created: customer.created ? new Date(customer.created * 1000) : null,
      delinquent: Boolean(customer.delinquent),
      defaultPaymentMethod:
        customer.invoice_settings?.default_payment_method || null,
    },
    subscriptions: subsList.data.map((s) => {
      const price = s.items?.data?.[0]?.price;
      return {
        id: s.id,
        status: s.status,
        priceId: price?.id || null,
        productId: price?.product || null,
        amountUsd: (price?.unit_amount || 0) / 100,
        interval: price?.recurring?.interval || null,
        intervalCount: price?.recurring?.interval_count || 1,
        trialEnd: s.trial_end ? new Date(s.trial_end * 1000) : null,
        currentPeriodStart: s.current_period_start
          ? new Date(s.current_period_start * 1000)
          : null,
        currentPeriodEnd: s.current_period_end
          ? new Date(s.current_period_end * 1000)
          : null,
        cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
        canceledAt: s.canceled_at ? new Date(s.canceled_at * 1000) : null,
        created: s.created ? new Date(s.created * 1000) : null,
      };
    }),
    invoices: invoicesList.data.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      amountPaidUsd: (i.amount_paid || 0) / 100,
      amountDueUsd: (i.amount_due || 0) / 100,
      currency: i.currency,
      created: i.created ? new Date(i.created * 1000) : null,
      paidAt: i.status_transitions?.paid_at
        ? new Date(i.status_transitions.paid_at * 1000)
        : null,
      hostedInvoiceUrl: i.hosted_invoice_url || null,
      invoicePdf: i.invoice_pdf || null,
    })),
    charges: chargesList.data.map((c) => ({
      id: c.id,
      amountUsd: (c.amount || 0) / 100,
      status: c.status,
      paid: Boolean(c.paid),
      refunded: Boolean(c.refunded),
      refundedUsd: (c.amount_refunded || 0) / 100,
      created: c.created ? new Date(c.created * 1000) : null,
      description: c.description || null,
      receiptUrl: c.receipt_url || null,
      failureMessage: c.failure_message || null,
    })),
    lifetimeRevenueUsd,
    invoiceCount: paidInvoices.length,
    mrrUsd,
  };
}

// =============================================================================
// Funnel — self-hosted analytics for the customer journey. Source data is
// FunnelEvent rows written by lib/demoEvents.js (server emits) and the
// /api/track beacon (client emits). FUNNEL_STEPS in lib/funnelEvents.js
// is the canonical ordering — change it there when a step is added.
// =============================================================================

// GET /api/admin/funnel?days=30
// Counts unique visitors per step (by anonId fallback to userId), with
// drop-off vs the previous step. Cheap because FunnelEvent has indexes
// on (name, ts) — one $facet branch per step.
router.get('/funnel', async (req, res) => {
  const rlog = req.log || log;
  const { days, startAt, endAt } = parseWindow(req);

  try {
    const facet = {};
    for (const step of FUNNEL_STEPS) {
      facet[step] = [
        { $match: { name: step } },
        // Identity = anonId (preferred) || userId (server-only emits).
        // Coerce both to string so the set dedupes correctly.
        {
          $group: {
            _id: {
              $ifNull: [
                '$anonId',
                { $cond: [{ $ne: ['$userId', null] }, { $toString: '$userId' }, null] },
              ],
            },
          },
        },
        { $match: { _id: { $ne: null } } },
        { $count: 'visitors' },
      ];
    }

    const [result] = await FunnelEvent.aggregate([
      { $match: { ts: { $gte: startAt, $lte: endAt } } },
      { $facet: facet },
    ]);

    const steps = FUNNEL_STEPS.map((step, i) => {
      const visitors = result?.[step]?.[0]?.visitors || 0;
      return { name: step, visitors, index: i };
    });
    // Drop-off vs previous step (and overall vs first).
    const top = steps[0]?.visitors || 0;
    let prev = top;
    for (const s of steps) {
      s.dropFromPrev = prev > 0 ? +(((prev - s.visitors) / prev) * 100).toFixed(1) : 0;
      s.conversionFromTop = top > 0 ? +((s.visitors / top) * 100).toFixed(1) : 0;
      prev = s.visitors;
    }

    // Top UTM sources for the window — drives "what brought visitors in"
    // panel on the funnel page. Keyed on utmSource only; medium/campaign
    // can be added later if useful.
    const utmRows = await FunnelEvent.aggregate([
      {
        $match: {
          ts: { $gte: startAt, $lte: endAt },
          name: 'page_view',
          utmSource: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$utmSource',
          visitors: { $addToSet: { $ifNull: ['$anonId', { $toString: '$userId' }] } },
        },
      },
      { $project: { _id: 0, source: '$_id', visitors: { $size: '$visitors' } } },
      { $sort: { visitors: -1 } },
      { $limit: 10 },
    ]);

    rlog.info({ days, top }, 'admin: funnel overview');
    res.json({
      window: { days, startAt: startAt.toISOString(), endAt: endAt.toISOString() },
      steps,
      utm: utmRows,
    });
  } catch (err) {
    rlog.error({ ...errContext(err) }, 'admin: funnel aggregate failed');
    res.status(500).json({ error: 'funnel_query_failed' });
  }
});

export default router;
