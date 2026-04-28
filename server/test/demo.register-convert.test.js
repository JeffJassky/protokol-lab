// Verifies POST /api/auth/register's demo-aware behavior:
//   - When called with a valid demo cookie, the response Set-Cookie clears
//     the demo_token (so the new real account starts fresh, not piggybacked
//     on the sandbox).
//   - The conversion is observable: the registered user has the right
//     identity and the demo cookie is gone.
//
// Convert event emission is verified by intercepting the Pino logger;
// rather than mock the logger we just confirm the cookie-clear side effect
// since that's the user-visible behavior.

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

function setCookies(res) {
  return res.headers['set-cookie'] || [];
}

function findCookie(cookies, name) {
  return cookies.find((c) => c.startsWith(`${name}=`)) || null;
}

describe('POST /api/auth/register — demo conversion behavior', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      FoodLog.deleteMany({}),
      FoodItem.deleteMany({}),
      WeightLog.deleteMany({}),
    ]);
  });

  it('clears demo cookie when register is called from a demo session', async () => {
    await seedTinyTemplate();
    const agent = request.agent(app);

    // Establish anon demo session.
    const start = await agent.post('/api/demo/start');
    expect(start.status).toBe(201);
    expect(findCookie(setCookies(start), DEMO_COOKIE_NAME)).toBeTruthy();

    // Register from inside the demo.
    const reg = await agent.post('/api/auth/register').send({
      email: 'newuser@example.com',
      password: 'passw0rd-ok',
    });
    expect(reg.status).toBe(201);

    // Set-Cookie on the register response should expire / clear the demo cookie.
    const cookies = setCookies(reg);
    const demoCookie = findCookie(cookies, DEMO_COOKIE_NAME);
    expect(demoCookie).toBeTruthy();
    // clearCookie sets either Expires=Thu, 01 Jan 1970 ... or Max-Age=0 / negative.
    const cleared =
      /expires=Thu, 01 Jan 1970/i.test(demoCookie) ||
      /max-age=(0|-)/i.test(demoCookie) ||
      demoCookie.includes(`${DEMO_COOKIE_NAME}=;`);
    expect(cleared).toBe(true);

    // And the JWT cookie is set.
    const tokenCookie = findCookie(cookies, 'token');
    expect(tokenCookie).toBeTruthy();
  });

  it('after demo→register, /api/demo/status reports mode=authed (no sandbox)', async () => {
    await seedTinyTemplate();
    const agent = request.agent(app);
    await agent.post('/api/demo/start');
    await agent.post('/api/auth/register').send({
      email: 'newuser2@example.com',
      password: 'passw0rd-ok',
    });
    const status = await agent.get('/api/demo/status');
    expect(status.body.mode).toBe('authed');
    expect(status.body.sandboxId).toBeNull();
    // No more anonymous-demo plan piggyback.
    expect(status.body.activePlanId).toBeNull();
  });

  it('register from a demo session deletes the sandbox doc + its child rows', async () => {
    await seedTinyTemplate();
    const agent = request.agent(app);
    const start = await agent.post('/api/demo/start');
    const sandboxId = start.body.sandboxId;

    // Sandbox + cloned rows are present pre-register.
    expect(await User.findById(sandboxId)).not.toBeNull();
    expect(await WeightLog.countDocuments({ userId: sandboxId })).toBeGreaterThan(0);

    await agent.post('/api/auth/register').send({
      email: 'destroyer@example.com',
      password: 'passw0rd-ok',
    });

    // Demo is pre-register only — sandbox + child rows are wiped immediately.
    expect(await User.findById(sandboxId)).toBeNull();
    expect(await WeightLog.countDocuments({ userId: sandboxId })).toBe(0);
    expect(await FoodLog.countDocuments({ userId: sandboxId })).toBe(0);
  });

  it('register without a demo cookie is unaffected (no spurious clear)', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({
      email: 'plain@example.com',
      password: 'passw0rd-ok',
    });
    expect(reg.status).toBe(201);
    // Only the auth token cookie should be set.
    const cookies = setCookies(reg);
    expect(findCookie(cookies, 'token')).toBeTruthy();
    expect(findCookie(cookies, DEMO_COOKIE_NAME)).toBeFalsy();
  });
});
