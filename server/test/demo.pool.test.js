// Warm-pool: verifies refillPool keeps the unclaimed count at the target,
// claims are atomic (two concurrent claims can't both win the last sandbox),
// /api/demo/start returns fromPool:true when the pool has stock and falls
// back to a sync build when empty, and the cleanup job leaves pooled
// sandboxes alone.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import FoodLog from '../src/models/FoodLog.js';
import FoodItem from '../src/models/FoodItem.js';
import WeightLog from '../src/models/WeightLog.js';
import {
  refillPool,
  claimPooledSandbox,
} from '../src/services/demo.js';
import { runDemoCleanup } from '../src/services/scheduler.js';

const app = createApp({ serveClient: false });

async function seedTinyTemplate() {
  const tmpl = await User.create({ email: 'tmpl@demo.local', isDemoTemplate: true });
  const fi = await FoodItem.create({ userId: tmpl._id, name: 'X', perServing: { calories: 100 }, isCustom: true });
  await FoodLog.create({
    userId: tmpl._id,
    foodItemId: fi._id,
    date: new Date(Date.now() - 24 * 60 * 60 * 1000),
    mealType: 'lunch',
    servingCount: 1,
  });
  await WeightLog.create({ userId: tmpl._id, weightLbs: 180, date: new Date() });
  return tmpl;
}

async function clearAll() {
  await Promise.all([
    User.deleteMany({}),
    FoodLog.deleteMany({}),
    FoodItem.deleteMany({}),
    WeightLog.deleteMany({}),
  ]);
}

describe('Warm pool — refillPool', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('returns 0 when no template is seeded', async () => {
    const r = await refillPool(3);
    expect(r.built).toBe(0);
  });

  it('builds up to target when pool is empty', async () => {
    await seedTinyTemplate();
    const r = await refillPool(3);
    expect(r.built).toBe(3);
    expect(r.current).toBe(3);
    const count = await User.countDocuments({ isPooled: true, isDemoSandbox: true });
    expect(count).toBe(3);
  });

  it('builds nothing when pool already at target', async () => {
    await seedTinyTemplate();
    await refillPool(2);
    const r = await refillPool(2);
    expect(r.built).toBe(0);
    expect(r.current).toBe(2);
  });

  it('only tops up the difference', async () => {
    await seedTinyTemplate();
    await refillPool(2);
    const r = await refillPool(5);
    expect(r.built).toBe(3);
    expect(r.current).toBe(5);
  });

  it('pooled sandbox carries cloned data + correct flags', async () => {
    await seedTinyTemplate();
    await refillPool(1);
    const sb = await User.findOne({ isPooled: true, isDemoSandbox: true });
    expect(sb.plan).toBe('unlimited');
    expect(sb.onboardingComplete).toBe(true);
    expect(sb.lastActiveAt).toBeNull();
    expect(await WeightLog.countDocuments({ userId: sb._id })).toBe(1);
  });
});

describe('Warm pool — claimPooledSandbox', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('returns null when pool is empty', async () => {
    const claimed = await claimPooledSandbox();
    expect(claimed).toBeNull();
  });

  it('flips isPooled and stamps lastActiveAt', async () => {
    await seedTinyTemplate();
    await refillPool(1);
    const claimed = await claimPooledSandbox();
    expect(claimed).toBeTruthy();
    expect(claimed.isPooled).toBe(false);
    expect(claimed.lastActiveAt).toBeInstanceOf(Date);
    expect(await User.countDocuments({ isPooled: true })).toBe(0);
  });

  it('two concurrent claims can not both win the same sandbox', async () => {
    await seedTinyTemplate();
    await refillPool(1); // exactly one in the pool
    const [a, b] = await Promise.all([claimPooledSandbox(), claimPooledSandbox()]);
    const winners = [a, b].filter(Boolean);
    expect(winners.length).toBe(1);
  });
});

describe('POST /api/demo/start — pool integration', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('returns fromPool:true when pool has stock', async () => {
    await seedTinyTemplate();
    await refillPool(1);
    const res = await request(app).post('/api/demo/start');
    expect(res.status).toBe(201);
    expect(res.body.fromPool).toBe(true);

    const sb = await User.findById(res.body.sandboxId);
    expect(sb.isPooled).toBe(false);
    expect(sb.lastActiveAt).toBeInstanceOf(Date);
  });

  it('falls back to sync build when pool is empty', async () => {
    await seedTinyTemplate();
    const res = await request(app).post('/api/demo/start');
    expect(res.status).toBe(201);
    expect(res.body.fromPool).toBe(false);

    const sb = await User.findById(res.body.sandboxId);
    expect(sb.plan).toBe('unlimited');
    expect(await WeightLog.countDocuments({ userId: sb._id })).toBe(1);
  });
});

describe('Cleanup ignores pooled sandboxes', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('does not reap a pooled sandbox even when older than the anon TTL', async () => {
    await seedTinyTemplate();
    await refillPool(1);
    // Force its createdAt back so the standard "lastActiveAt:null + old createdAt"
    // anon-reap branch would otherwise fire.
    await User.updateOne(
      { isPooled: true },
      { $set: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } },
    );

    const r = await runDemoCleanup();
    expect(r.anonDeleted).toBe(0);
    expect(await User.countDocuments({ isPooled: true })).toBe(1);
  });
});
