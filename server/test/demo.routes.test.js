// Demo routes — anon /start + /status. Demo is pre-register only;
// /enter, /exit, /reset have been removed (cleanup happens in routes/auth.js
// on login/register).

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import FoodLog from '../src/models/FoodLog.js';
import FoodItem from '../src/models/FoodItem.js';
import WeightLog from '../src/models/WeightLog.js';
import { DEMO_COOKIE_NAME } from '../src/lib/demoSession.js';

const app = createApp({ serveClient: false });

async function seedTinyTemplate() {
  const tmpl = await User.create({ email: 'tmpl@demo.local', isDemoTemplate: true });
  const fi = await FoodItem.create({ userId: tmpl._id, name: 'X', caloriesPer: 100, isCustom: true });
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

async function registerReal(email = `r-${Math.random().toString(36).slice(2, 8)}@example.com`) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send({ email, password: 'passw0rd-ok' });
  expect(res.status).toBe(201);
  return { agent, userId: res.body.user.id };
}

function getCookie(res, name) {
  const set = res.headers['set-cookie'] || [];
  const found = set.find((c) => c.startsWith(`${name}=`));
  return found ? found.split(';')[0].split('=')[1] : null;
}

describe('POST /api/demo/start (anonymous)', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => {
    await User.deleteMany({});
    await FoodLog.deleteMany({});
    await FoodItem.deleteMany({});
    await WeightLog.deleteMany({});
  });

  it('400 when no template exists yet (or 500 — either flagged as setup error)', async () => {
    const res = await request(app).post('/api/demo/start');
    expect([400, 500]).toContain(res.status);
  });

  it('creates anon sandbox and sets demo cookie', async () => {
    await seedTinyTemplate();
    const res = await request(app).post('/api/demo/start');
    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('anon');
    expect(res.body.sandboxId).toBeDefined();

    const cookieVal = getCookie(res, DEMO_COOKIE_NAME);
    expect(cookieVal).toBeTruthy();

    const sandbox = await User.findById(res.body.sandboxId);
    expect(sandbox.isDemoSandbox).toBe(true);
    expect(sandbox.parentUserId).toBeNull();

    expect(await WeightLog.countDocuments({ userId: sandbox._id })).toBe(1);
  });

  it('refuses /start when caller already has JWT', async () => {
    await seedTinyTemplate();
    const { agent } = await registerReal();
    const res = await agent.post('/api/demo/start');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('already_authenticated');
  });
});

describe('removed authed-toggle routes — 404', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => { await User.deleteMany({}); });

  it.each(['/api/demo/enter', '/api/demo/exit', '/api/demo/reset'])(
    '%s no longer routed',
    async (path) => {
      const { agent } = await registerReal();
      const res = await agent.post(path);
      expect(res.status).toBe(404);
    },
  );
});

describe('GET /api/demo/status', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => {
    await User.deleteMany({});
    await FoodLog.deleteMany({});
    await FoodItem.deleteMany({});
    await WeightLog.deleteMany({});
  });

  it('mode=none with no session', async () => {
    const res = await request(app).get('/api/demo/status');
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('none');
    expect(res.body.templateAvailable).toBe(false);
    expect(res.body.activePlanId).toBeNull();
    expect(res.body.template).toBeNull();
  });

  it('mode=anon after /start', async () => {
    await seedTinyTemplate();
    const agent = request.agent(app);
    await agent.post('/api/demo/start');
    const res = await agent.get('/api/demo/status');
    expect(res.body.mode).toBe('anon');
    expect(res.body.isAnonymous).toBe(true);
    expect(res.body.templateAvailable).toBe(true);
  });

  it('mode=authed (no toggle) after login', async () => {
    await seedTinyTemplate();
    const { agent } = await registerReal();
    const res = await agent.get('/api/demo/status');
    expect(res.body.mode).toBe('authed');
    expect(res.body.sandboxId).toBeNull();
  });

  it('returns activePlanId=unlimited for anon demo (sandbox plan visible to client)', async () => {
    await seedTinyTemplate();
    const agent = request.agent(app);
    await agent.post('/api/demo/start');
    const res = await agent.get('/api/demo/status');
    expect(res.body.activePlanId).toBe('unlimited');
  });

  it('returns no activePlanId for an authed user (demo is pre-register only)', async () => {
    await seedTinyTemplate();
    const { agent } = await registerReal();
    const res = await agent.get('/api/demo/status');
    expect(res.body.activePlanId).toBeNull();
  });

  it('returns template metadata (compoundNames + dayCount + displayName)', async () => {
    // Build a template with one compound + a date range so the metadata fields populate.
    const tmpl = await User.create({
      email: 'tmpl@demo.local',
      isDemoTemplate: true,
      displayName: 'Jeff',
    });
    const Compound = (await import('../src/models/Compound.js')).default;
    await Compound.create({
      userId: tmpl._id,
      name: 'Tirzepatide',
      isSystem: false,
      enabled: true,
      halfLifeDays: 5,
      intervalDays: 7,
    });
    await WeightLog.create({ userId: tmpl._id, weightLbs: 180, date: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) });
    await WeightLog.create({ userId: tmpl._id, weightLbs: 175, date: new Date() });

    const res = await request(app).get('/api/demo/status');
    expect(res.body.template).toBeTruthy();
    expect(res.body.template.compoundNames).toEqual(['Tirzepatide']);
    expect(res.body.template.dayCount).toBeGreaterThanOrEqual(99);
    expect(res.body.template.displayName).toBe('Jeff');
  });

  it('omits system + disabled compounds from template metadata', async () => {
    const tmpl = await User.create({ email: 'tmpl@demo.local', isDemoTemplate: true });
    const Compound = (await import('../src/models/Compound.js')).default;
    await Compound.create({ userId: tmpl._id, name: 'SystemSeeded', isSystem: true, enabled: true, halfLifeDays: 5, intervalDays: 7 });
    await Compound.create({ userId: tmpl._id, name: 'Disabled', isSystem: false, enabled: false, halfLifeDays: 5, intervalDays: 7 });
    await Compound.create({ userId: tmpl._id, name: 'ActiveCustom', isSystem: false, enabled: true, halfLifeDays: 5, intervalDays: 7 });

    const res = await request(app).get('/api/demo/status');
    expect(res.body.template.compoundNames).toEqual(['ActiveCustom']);
  });
});

describe('demo session round-trip — sandbox data scoping', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => {
    await User.deleteMany({});
    await FoodLog.deleteMany({});
    await FoodItem.deleteMany({});
    await WeightLog.deleteMany({});
  });

  it('anon demo can read sandbox weight via /api/weight', async () => {
    await seedTinyTemplate();
    const agent = request.agent(app);
    await agent.post('/api/demo/start');
    const res = await agent.get('/api/weight');
    expect(res.status).toBe(200);
    // template seed had 1 weight log
    expect(res.body.entries?.length).toBe(1);
  });

  it('authed user with grandfathered activeProfileId still scopes to sandbox (middleware unchanged)', async () => {
    // The /enter route is gone but the requireAuth middleware still
    // honors a stored activeProfileId — this preserves the data scoping
    // for any pre-existing record until the next login() call wipes it.
    await seedTinyTemplate();
    const { agent, userId } = await registerReal();
    await agent.post('/api/weight').send({ weightLbs: 150, date: '2026-01-15' });

    // Manually create a parented sandbox + point activeProfileId at it
    // (simulates a record from before this change).
    const { getOrCreateSandbox } = await import('../src/services/demo.js');
    const { sandbox } = await getOrCreateSandbox({ authUserId: userId });
    await User.updateOne({ _id: userId }, { $set: { activeProfileId: sandbox._id } });

    const r = await agent.get('/api/weight');
    expect(r.body.entries.length).toBe(1);
    expect(r.body.entries[0].weightLbs).toBe(180); // sandbox's cloned weight
  });
});
