// Chat quota middleware — protects revenue (free users can't drain GPT budget)
// and UX (paid users shouldn't get mystery 429s).
//
// Strategy: mount `requireChatQuota` on a tiny Express app with a stub "user"
// injector in place of requireAuth. Seed ChatUsage rows to cross thresholds.
// Assert deny reasons + HTTP codes.

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { requireChatQuota, CHAT_QUOTA_REASONS } from '../src/middleware/requireChatQuota.js';
import ChatUsage from '../src/models/ChatUsage.js';
import User from '../src/models/User.js';
import { PLAN_IDS, PLANS } from '../../shared/plans.js';

// Mount a minimal app where req.user is injected from a module-level var. Each
// test sets `currentUser` to whatever it needs; middleware reads req.user.
let currentUser = null;

function mkApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = currentUser;
    req.files = []; // non-image turns
    next();
  });
  app.post('/chat', requireChatQuota, (req, res) => res.json({ ok: true }));
  return app;
}

async function seedUser(plan, overrides = {}) {
  const user = await User.create({
    email: `${plan}-${Math.random().toString(36).slice(2, 6)}@example.com`,
    passwordHash: 'x',
    plan,
    ...overrides,
  });
  currentUser = user;
  return user;
}

async function seedUsage(userId, { count = 1, at = new Date(), fields = {} } = {}) {
  const docs = [];
  for (let i = 0; i < count; i++) {
    docs.push({
      userId,
      model: 'gemini-3-flash',
      planAtTime: 'premium',
      createdAt: new Date(at.getTime() - i * 1000),
      totalCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      imageCount: 0,
      status: 'ok',
      ...fields,
    });
  }
  await ChatUsage.insertMany(docs);
}

beforeEach(() => {
  currentUser = null;
});

describe('auth gate', () => {
  it('200 when plan has chat quota and usage empty (premium)', async () => {
    await seedUser(PLAN_IDS.PREMIUM);
    const res = await request(mkApp()).post('/chat').send({});
    expect(res.status).toBe(200);
  });

  it('401 when req.user missing', async () => {
    currentUser = null;
    const res = await request(mkApp()).post('/chat').send({});
    expect(res.status).toBe(401);
  });
});

describe('per-minute rate limit', () => {
  it('429 with per_minute_rate_limit when messagesPerMinute exceeded', async () => {
    const user = await seedUser(PLAN_IDS.PREMIUM);
    const limit = PLANS[PLAN_IDS.PREMIUM].chat.messagesPerMinute;
    await seedUsage(user._id, { count: limit, at: new Date() });

    const res = await request(mkApp()).post('/chat').send({});
    expect(res.status).toBe(429);
    expect(res.body.reason).toBe(CHAT_QUOTA_REASONS.PER_MINUTE);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('does not trigger for usage older than 1 minute', async () => {
    const user = await seedUser(PLAN_IDS.PREMIUM);
    const limit = PLANS[PLAN_IDS.PREMIUM].chat.messagesPerMinute;
    // All usage 2 minutes old — outside minute window but inside day.
    await seedUsage(user._id, {
      count: limit,
      at: new Date(Date.now() - 120_000),
    });
    const res = await request(mkApp()).post('/chat').send({});
    expect(res.status).toBe(200);
  });
});

describe('daily message cap', () => {
  it('429 DAILY_MESSAGES when messagesPerDay exceeded', async () => {
    const user = await seedUser(PLAN_IDS.PREMIUM);
    const plan = PLANS[PLAN_IDS.PREMIUM];
    const dayLimit = plan.chat.messagesPerDay;
    const minuteLimit = plan.chat.messagesPerMinute;

    if (!Number.isFinite(dayLimit)) {
      // Premium may be uncapped — skip but don't fail. Future plans may cap.
      return;
    }

    // Seed just over the daily cap, but spaced to avoid tripping per-minute.
    const now = new Date();
    // Batches of (minuteLimit - 1) per chunk, each ≥70s apart.
    const total = dayLimit;
    const chunkSize = Math.max(1, minuteLimit - 1);
    let seeded = 0;
    let offsetSec = 120;
    while (seeded < total) {
      const n = Math.min(chunkSize, total - seeded);
      await seedUsage(user._id, {
        count: n,
        at: new Date(now.getTime() - offsetSec * 1000),
      });
      seeded += n;
      offsetSec += 120;
    }

    const res = await request(mkApp()).post('/chat').send({});
    expect(res.status).toBe(429);
    expect(res.body.reason).toBe(CHAT_QUOTA_REASONS.DAILY_MESSAGES);
  });
});

describe('daily cost cap', () => {
  it('429 DAILY_COST when costUsdPerDay exceeded', async () => {
    const user = await seedUser(PLAN_IDS.PREMIUM);
    const limit = PLANS[PLAN_IDS.PREMIUM].chat.costUsdPerDay;
    if (!Number.isFinite(limit)) return;

    // Single expensive row — spend the whole daily budget. Old enough
    // (2 min back) to not trip per-minute.
    await seedUsage(user._id, {
      count: 1,
      at: new Date(Date.now() - 120_000),
      fields: { totalCostUsd: limit },
    });

    const res = await request(mkApp()).post('/chat').send({});
    expect(res.status).toBe(429);
    expect(res.body.reason).toBe(CHAT_QUOTA_REASONS.DAILY_COST);
    expect(res.body.limit).toBe(limit);
  });
});

describe('monthly cost cap', () => {
  it('429 MONTHLY_COST when monthly exceeded but today under', async () => {
    const user = await seedUser(PLAN_IDS.PREMIUM);
    const planChat = PLANS[PLAN_IDS.PREMIUM].chat;
    const monthLimit = planChat.costUsdPerMonth;
    const dayLimit = planChat.costUsdPerDay;
    if (!Number.isFinite(monthLimit) || !Number.isFinite(dayLimit)) return;

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const daysIntoMonth = Math.floor((now.getTime() - startOfMonth.getTime()) / 86400000);
    const perDay = dayLimit * 0.9;
    const daysNeeded = Math.ceil(monthLimit / perDay);
    // If we're not far enough into the month to spread charges across past
    // days without overflowing today, this test isn't meaningful — skip.
    if (daysNeeded > daysIntoMonth) return;

    // Seed one row per past day at 90% of the daily cap. Today stays at $0.
    for (let i = 0; i < daysNeeded; i++) {
      await ChatUsage.create({
        userId: user._id,
        model: 'gemini-3-flash',
        createdAt: new Date(startOfMonth.getTime() + i * 86400000 + 60_000),
        totalCostUsd: perDay,
      });
    }

    const res = await request(mkApp()).post('/chat').send({});
    expect(res.status).toBe(429);
    expect(res.body.reason).toBe(CHAT_QUOTA_REASONS.MONTHLY_COST);
  });
});

describe('limitsOverride', () => {
  it('per-user costUsdPerDay override tightens the cap', async () => {
    const user = await seedUser(PLAN_IDS.PREMIUM, {
      limitsOverride: { chat: { costUsdPerDay: 0.01 } },
    });

    // One row at $0.02 exceeds the override.
    await seedUsage(user._id, {
      count: 1,
      at: new Date(Date.now() - 120_000),
      fields: { totalCostUsd: 0.02 },
    });

    const res = await request(mkApp()).post('/chat').send({});
    expect(res.status).toBe(429);
    expect(res.body.reason).toBe(CHAT_QUOTA_REASONS.DAILY_COST);
    expect(res.body.limit).toBe(0.01);
  });

});

describe('image turn — free user lifetime cap', () => {
  it('free user can send an image under lifetime cap', async () => {
    const lifetime = PLANS[PLAN_IDS.FREE].chat.imagesLifetime;
    if (!Number.isFinite(lifetime) || lifetime === 0) return;

    const user = await seedUser(PLAN_IDS.FREE, { imageRecognitionCount: 0 });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = user;
      // Pretend multer attached one image.
      req.files = [{ buffer: Buffer.from(''), mimetype: 'image/jpeg', originalname: 'a.jpg' }];
      next();
    });
    app.post('/chat', requireChatQuota, (req, res) => res.json({ ok: true }));

    const res = await request(app).post('/chat').send({});
    expect(res.status).toBe(200);
  });

  it('free user image over lifetime cap → 429 IMAGES_LIFETIME', async () => {
    const lifetime = PLANS[PLAN_IDS.FREE].chat.imagesLifetime;
    if (!Number.isFinite(lifetime)) return;

    const user = await seedUser(PLAN_IDS.FREE, { imageRecognitionCount: lifetime });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = user;
      req.files = [{ buffer: Buffer.from(''), mimetype: 'image/jpeg', originalname: 'a.jpg' }];
      next();
    });
    app.post('/chat', requireChatQuota, (req, res) => res.json({ ok: true }));

    const res = await request(app).post('/chat').send({});
    expect(res.status).toBe(429);
    expect(res.body.reason).toBe(CHAT_QUOTA_REASONS.IMAGES_LIFETIME);
  });
});

describe('fail-open on telemetry error', () => {
  it('passes through when ChatUsage.aggregate throws', async () => {
    const user = await seedUser(PLAN_IDS.PREMIUM);
    // Replace aggregate with one that throws, for this test only.
    const orig = ChatUsage.aggregate;
    ChatUsage.aggregate = () => {
      throw new Error('simulated db blip');
    };
    try {
      const res = await request(mkApp()).post('/chat').send({});
      expect(res.status).toBe(200);
    } finally {
      ChatUsage.aggregate = orig;
    }
  });
});
