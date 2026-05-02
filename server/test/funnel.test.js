// Funnel telemetry — beacon validation, dual-write from server emits,
// anon→user stitching at register time, admin aggregation.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import FunnelEvent from '../src/models/FunnelEvent.js';
import FoodLog from '../src/models/FoodLog.js';
import FoodItem from '../src/models/FoodItem.js';
import WeightLog from '../src/models/WeightLog.js';
import { ANON_ID_COOKIE } from '../src/middleware/anonId.js';
import { waitForFunnelDrain } from '../src/lib/funnelEvents.js';

const app = createApp({ serveClient: false });

function getCookie(res, name) {
  const set = res.headers['set-cookie'] || [];
  const found = set.find((c) => c.startsWith(`${name}=`));
  return found ? found.split(';')[0].split('=')[1] : null;
}

async function flushFunnelWrites() {
  // insertFunnelEvent fires from emit handlers without awaiting in callers.
  // Drain the in-flight set so assertions run after every persist resolves.
  await waitForFunnelDrain();
}

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

describe('POST /api/track (beacon)', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => {
    await FunnelEvent.deleteMany({});
    await User.deleteMany({});
  });

  it('rejects unknown event names', async () => {
    const res = await request(app)
      .post('/api/track')
      .send({ name: 'wat_is_this' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_event');
  });

  it('persists allowlisted event tagged with anonId cookie', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/track').send({
      name: 'page_view',
      props: { name: 'landing' },
      path: '/',
      utm: { source: 'twitter' },
    });
    expect(res.status).toBe(204);
    await flushFunnelWrites();

    const rows = await FunnelEvent.find({});
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('page_view');
    expect(rows[0].anonId).toBeTruthy();
    expect(rows[0].path).toBe('/');
    expect(rows[0].utmSource).toBe('twitter');
    expect(rows[0].userId).toBeNull();
  });
});

describe('Server emit dual-write to FunnelEvent', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => {
    await FunnelEvent.deleteMany({});
    await User.deleteMany({});
    await FoodLog.deleteMany({});
    await FoodItem.deleteMany({});
    await WeightLog.deleteMany({});
  });

  it('writes demo_start row when /api/demo/start succeeds', async () => {
    await seedTinyTemplate();
    const res = await request(app).post('/api/demo/start');
    expect(res.status).toBe(201);
    await flushFunnelWrites();

    const rows = await FunnelEvent.find({ name: 'demo_start' });
    expect(rows.length).toBe(1);
    expect(rows[0].sandboxId).toBeTruthy();
    expect(rows[0].anonId).toBeTruthy();
  });
});

describe('Anon→user stitching on register', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => {
    await FunnelEvent.deleteMany({});
    await User.deleteMany({});
  });

  it('backfills userId onto prior events sharing the anonId', async () => {
    const agent = request.agent(app);

    // First, an unauthenticated page_view sets the bo_aid cookie and
    // creates a row with userId=null.
    const beacon = await agent.post('/api/track').send({
      name: 'page_view',
      props: { name: 'landing' },
    });
    expect(beacon.status).toBe(204);
    await flushFunnelWrites();

    const anonRow = await FunnelEvent.findOne({ name: 'page_view' });
    expect(anonRow.userId).toBeNull();
    const anonId = anonRow.anonId;
    expect(anonId).toBeTruthy();

    // The same agent registers — request carries the bo_aid cookie.
    const reg = await agent.post('/api/auth/register').send({
      email: `r-${Date.now()}@example.com`,
      password: 'passw0rd-ok',
    });
    expect(reg.status).toBe(201);
    const userId = reg.body.user.id;
    await flushFunnelWrites();

    const stitched = await FunnelEvent.findOne({ name: 'page_view', anonId });
    expect(String(stitched.userId)).toBe(String(userId));
  });
});

describe('GET /api/admin/funnel', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => {
    await FunnelEvent.deleteMany({});
    await User.deleteMany({});
  });

  it('counts unique visitors per step ordered by FUNNEL_STEPS', async () => {
    // Set up an admin user + auth. The agent's bo_aid cookie threads
    // through every request.
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({
      email: 'admin@example.com',
      password: 'passw0rd-ok',
    });
    expect(reg.status).toBe(201);
    await User.updateOne({ _id: reg.body.user.id }, { $set: { isAdmin: true } });

    // Three distinct anons fire page_view; two of them fire cta_click;
    // one of them fires demo_start. Funnel should show 3 → 2 → 1.
    await FunnelEvent.create([
      { name: 'page_view', anonId: 'a1' },
      { name: 'page_view', anonId: 'a2' },
      { name: 'page_view', anonId: 'a3' },
      { name: 'cta_click', anonId: 'a1' },
      { name: 'cta_click', anonId: 'a2' },
      { name: 'demo_start', anonId: 'a1' },
    ]);

    const res = await agent.get('/api/admin/funnel?days=30');
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.steps.map((s) => [s.name, s]));
    expect(byName.page_view.visitors).toBe(3);
    expect(byName.cta_click.visitors).toBe(2);
    expect(byName.demo_start.visitors).toBe(1);
    expect(byName.demo_start.dropFromPrev).toBe(50);
  });
});
