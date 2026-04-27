// HTTP-level end-to-end tests for the 5 canonical conversion paths from
// docs/blog/customer-journey.md §2, plus the visitor-state matrix from §1.
//
// These walk the full request sequence a real visitor would generate,
// asserting response codes, cookies, and the resulting DB state at each
// step. They catch contract regressions across the demo + auth boundary
// — the class of bug that produced "Premium badge in demo," "Upgrade to
// Free," and "Log nav kicks me out" before we caught them by hand.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import FoodItem from '../src/models/FoodItem.js';
import FoodLog from '../src/models/FoodLog.js';
import WeightLog from '../src/models/WeightLog.js';
import Compound from '../src/models/Compound.js';
import DoseLog from '../src/models/DoseLog.js';
import { DEMO_COOKIE_NAME } from '../src/lib/demoSession.js';

const app = createApp({ serveClient: false });

async function seedTemplate({ days = 30 } = {}) {
  const tmpl = await User.create({
    email: 'tmpl@demo.local',
    isDemoTemplate: true,
    displayName: 'Jeff',
  });
  await Compound.create({
    userId: tmpl._id,
    name: 'Tirzepatide',
    isSystem: false,
    enabled: true,
    halfLifeDays: 5,
    intervalDays: 7,
  });
  const fi = await FoodItem.create({
    userId: tmpl._id,
    name: 'Eggs',
    caloriesPer: 80,
    isCustom: true,
  });
  await FoodLog.create({
    userId: tmpl._id,
    foodItemId: fi._id,
    date: new Date(),
    mealType: 'breakfast',
    servingCount: 2,
  });
  await WeightLog.create({
    userId: tmpl._id,
    weightLbs: 200,
    date: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
  });
  await WeightLog.create({
    userId: tmpl._id,
    weightLbs: 185,
    date: new Date(),
  });
  return tmpl;
}

async function clearAll() {
  await Promise.all([
    User.deleteMany({}),
    FoodItem.deleteMany({}),
    FoodLog.deleteMany({}),
    WeightLog.deleteMany({}),
    Compound.deleteMany({}),
    DoseLog.deleteMany({}),
  ]);
}

function setCookies(res) { return res.headers['set-cookie'] || []; }
function findCookie(cookies, name) {
  return cookies.find((c) => c.startsWith(`${name}=`)) || null;
}

// ---------------------------------------------------------------------------
// Path A: Cold → Demo → Real account
// ---------------------------------------------------------------------------
describe('Path A — Cold → Demo → Real account', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('walks the full happy path from /demo/start to onboarded real user', async () => {
    await seedTemplate();
    const agent = request.agent(app);

    // Step 1-2: Mint anon sandbox.
    const start = await agent.post('/api/demo/start');
    expect(start.status).toBe(201);
    expect(start.body.mode).toBe('anon');
    expect(start.body.sandboxId).toBeDefined();
    expect(findCookie(setCookies(start), DEMO_COOKIE_NAME)).toBeTruthy();

    // Step 3 (implicit): visitor lands on /dashboard. Verify they can read
    // sandbox data via the data-routes (this proves the session-split is
    // routing to the sandbox not a missing real account).
    const weight = await agent.get('/api/weight');
    expect(weight.status).toBe(200);
    expect(weight.body.entries.length).toBe(2);

    // /demo/status should reflect anon mode + unlimited plan + populated template metadata.
    const status = await agent.get('/api/demo/status');
    expect(status.body.mode).toBe('anon');
    expect(status.body.activePlanId).toBe('unlimited');
    expect(status.body.template?.compoundNames).toContain('Tirzepatide');

    // Step 4-6: Visitor clicks "Set Up My Profile" → /start. Client makes
    // these API calls in sequence.
    const reg = await agent.post('/api/auth/register').send({
      email: 'newuser@example.com',
      password: 'passw0rd-ok',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe('newuser@example.com');

    // Demo cookie cleared on register.
    const regCookies = setCookies(reg);
    expect(findCookie(regCookies, 'token')).toBeTruthy();
    const demoAfterReg = findCookie(regCookies, DEMO_COOKIE_NAME);
    expect(demoAfterReg).toMatch(/expires=Thu, 01 Jan 1970|max-age=(0|-)/i);

    // Compound + dose logged against the new real user.
    const compoundList = await agent.get('/api/compounds');
    expect(compoundList.body.compounds.length).toBeGreaterThan(0);
    const tirz = compoundList.body.compounds.find((c) => c.name === 'Tirzepatide');
    expect(tirz).toBeTruthy();

    const dose = await agent.post('/api/doses').send({
      compoundId: tirz._id,
      value: 5,
      date: new Date().toISOString(),
    });
    expect(dose.status).toBe(201);

    // Step 7: Mark onboarding complete.
    const complete = await agent.post('/api/auth/onboarding/complete');
    expect(complete.status).toBe(200);
    expect(complete.body.user.onboardingComplete).toBe(true);

    // Final state: real user with own data, no demo session.
    const finalStatus = await agent.get('/api/demo/status');
    expect(finalStatus.body.mode).toBe('authed');
    expect(finalStatus.body.sandboxId).toBeNull();

    // The sandbox row still exists but is no longer attached to anything;
    // the cleanup cron will reap it within 24h. We don't assert deletion
    // here (cleanup is its own test).
  });
});

// ---------------------------------------------------------------------------
// Path B: Cold → Free signup (no demo)
// ---------------------------------------------------------------------------
describe('Path B — Cold → Free signup (no demo)', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('lands user with onboardingComplete=false (forced into wizard)', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({
      email: 'wizard@example.com',
      password: 'passw0rd-ok',
    });
    expect(reg.status).toBe(201);
    expect(reg.body.user.onboardingComplete).toBe(false);

    // No demo cookie was set or cleared.
    const cookies = setCookies(reg);
    expect(findCookie(cookies, DEMO_COOKIE_NAME)).toBeFalsy();

    // /demo/status reflects authed-no-sandbox.
    const status = await agent.get('/api/demo/status');
    expect(status.body.mode).toBe('authed');
    expect(status.body.sandboxId).toBeNull();
    expect(status.body.activePlanId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Path C: Cold → Paid trial signup
// ---------------------------------------------------------------------------
describe('Path C — Cold → Paid trial signup', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('plan/interval are client-side concerns: server registration is identical', async () => {
    // The ?plan= and ?interval= params live in the URL only; the register
    // request body has no plan field, and Stripe checkout is initiated by
    // the client after a successful register. We assert the server contract
    // hasn't drifted (plan field would be silently ignored if added).
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({
      email: 'trial@example.com',
      password: 'passw0rd-ok',
      plan: 'premium', // server ignores
      interval: 'yearly', // server ignores
    });
    expect(reg.status).toBe(201);
    // User starts on free plan; Stripe webhook will promote them after
    // checkout (covered by stripe.webhook.test.js).
    expect(reg.body.user.plan).toBe('free');
  });
});

// ---------------------------------------------------------------------------
// Path D: Existing user → Login
// ---------------------------------------------------------------------------
describe('Path D — Existing user → Login', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('returning user logs in and lands authenticated', async () => {
    // Register first (separate agent so the JWT from register doesn't carry).
    const a = request.agent(app);
    await a.post('/api/auth/register').send({
      email: 'returning@example.com',
      password: 'passw0rd-ok',
    });

    // Fresh agent for login.
    const b = request.agent(app);
    const login = await b.post('/api/auth/login').send({
      email: 'returning@example.com',
      password: 'passw0rd-ok',
    });
    expect(login.status).toBe(200);
    expect(findCookie(setCookies(login), 'token')).toBeTruthy();

    const me = await b.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('returning@example.com');
  });

  it('login from an active demo session preserves the JWT path (auth identity wins)', async () => {
    await seedTemplate();
    const a = request.agent(app);
    await a.post('/api/auth/register').send({
      email: 'returning2@example.com',
      password: 'passw0rd-ok',
    });

    // Now: visitor in a demo, then logs in (same browser).
    const b = request.agent(app);
    await b.post('/api/demo/start');
    const login = await b.post('/api/auth/login').send({
      email: 'returning2@example.com',
      password: 'passw0rd-ok',
    });
    expect(login.status).toBe(200);

    // /api/auth/me works → JWT path dominates over the still-present demo cookie.
    const me = await b.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('returning2@example.com');
  });
});

// ---------------------------------------------------------------------------
// Path E: Authed user → Toggle into demo
// ---------------------------------------------------------------------------
describe('Path E — Authed user → Toggle into demo', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('toggle in → see sandbox data; toggle out → see real data; reset → fresh sandbox', async () => {
    await seedTemplate();
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'toggler@example.com',
      password: 'passw0rd-ok',
    });

    // Real user logs their own weight.
    await agent.post('/api/weight').send({ weightLbs: 170, date: '2026-04-01' });

    // Default state: sees own weight only.
    let weight = await agent.get('/api/weight');
    expect(weight.body.entries.length).toBe(1);
    expect(weight.body.entries[0].weightLbs).toBe(170);

    // Toggle into demo.
    const enter = await agent.post('/api/demo/enter');
    expect(enter.status).toBe(200);
    expect(enter.body.created).toBe(true);

    // Now sees sandbox-cloned weights from template (2 of them).
    weight = await agent.get('/api/weight');
    expect(weight.body.entries.length).toBe(2);

    // Status reflects the toggle + unlimited plan.
    let status = await agent.get('/api/demo/status');
    expect(status.body.mode).toBe('authed');
    expect(status.body.sandboxId).toBe(enter.body.sandboxId);
    expect(status.body.activePlanId).toBe('unlimited');

    // Edit the sandbox: log a new weight.
    await agent.post('/api/weight').send({ weightLbs: 188, date: '2026-04-15' });
    weight = await agent.get('/api/weight');
    expect(weight.body.entries.length).toBe(3);

    // Toggle back out.
    await agent.post('/api/demo/exit');
    weight = await agent.get('/api/weight');
    expect(weight.body.entries.length).toBe(1);
    expect(weight.body.entries[0].weightLbs).toBe(170);

    // Re-enter → reuses same sandbox (sandbox edits intact).
    const enter2 = await agent.post('/api/demo/enter');
    expect(enter2.body.created).toBe(false);
    expect(enter2.body.sandboxId).toBe(enter.body.sandboxId);
    weight = await agent.get('/api/weight');
    expect(weight.body.entries.length).toBe(3); // includes the 188 they added

    // Reset → wipes sandbox + reclones from template (back to 2 weights).
    await agent.post('/api/demo/reset');
    weight = await agent.get('/api/weight');
    expect(weight.body.entries.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Visitor-state matrix (§1)
// ---------------------------------------------------------------------------
describe('Visitor-state matrix — every state surfaces the right /me + /demo/status', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('Anon visitor: /me 401, /demo/status mode=none', async () => {
    const agent = request.agent(app);
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(401);

    const status = await agent.get('/api/demo/status');
    expect(status.body.mode).toBe('none');
    expect(status.body.sandboxId).toBeNull();
  });

  it('Anon demo: /me 403 (auth-only), /demo/status mode=anon + unlimited plan', async () => {
    await seedTemplate();
    const agent = request.agent(app);
    await agent.post('/api/demo/start');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(403); // requireAuthUser blocks anon demo

    const status = await agent.get('/api/demo/status');
    expect(status.body.mode).toBe('anon');
    expect(status.body.isAnonymous).toBe(true);
    expect(status.body.activePlanId).toBe('unlimited');
  });

  it('Authed user: /me 200, /demo/status mode=authed no sandbox', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'plain@example.com',
      password: 'passw0rd-ok',
    });

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);

    const status = await agent.get('/api/demo/status');
    expect(status.body.mode).toBe('authed');
    expect(status.body.sandboxId).toBeNull();
    expect(status.body.activePlanId).toBeNull();
  });

  it('Authed in demo: /me returns real user, /demo/status carries sandboxId + unlimited', async () => {
    await seedTemplate();
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'toggler@example.com',
      password: 'passw0rd-ok',
    });
    const enter = await agent.post('/api/demo/enter');

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('toggler@example.com'); // auth identity, not sandbox

    const status = await agent.get('/api/demo/status');
    expect(status.body.mode).toBe('authed');
    expect(status.body.sandboxId).toBe(enter.body.sandboxId);
    expect(status.body.activePlanId).toBe('unlimited');
  });

  it('Authed mid-wizard: onboardingComplete=false visible on /me', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({
      email: 'wizard@example.com',
      password: 'passw0rd-ok',
    });
    expect(reg.body.user.onboardingComplete).toBe(false);

    const me = await agent.get('/api/auth/me');
    expect(me.body.user.onboardingComplete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Auth-only edges (§5 anti-pattern: anon demo must not reach billing/push/etc)
// ---------------------------------------------------------------------------
describe('Auth-only edges reject anon demo', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('anon demo gets 403 on /api/auth/me', async () => {
    await seedTemplate();
    const agent = request.agent(app);
    await agent.post('/api/demo/start');
    const r = await agent.get('/api/auth/me');
    expect(r.status).toBe(403);
  });

  it('anon demo gets 403 on /api/stripe/subscription', async () => {
    await seedTemplate();
    const agent = request.agent(app);
    await agent.post('/api/demo/start');
    const r = await agent.get('/api/stripe/subscription');
    expect(r.status).toBe(403);
  });

  it('anon demo gets 403 on /api/chat (AI is real-account-only in demo)', async () => {
    await seedTemplate();
    const agent = request.agent(app);
    await agent.post('/api/demo/start');
    // Hit any chat endpoint — list threads suffices.
    const r = await agent.get('/api/chat/threads');
    expect(r.status).toBe(403);
  });

  it('authed user IN DEMO also blocked from /api/chat (requireRealProfile)', async () => {
    await seedTemplate();
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'd@example.com', password: 'passw0rd-ok',
    });
    await agent.post('/api/demo/enter');
    const r = await agent.get('/api/chat/threads');
    expect(r.status).toBe(403);
  });

  it('authed user NOT in demo can hit /api/chat (assuming threads endpoint exists)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'd2@example.com', password: 'passw0rd-ok',
    });
    const r = await agent.get('/api/chat/threads');
    // Either 200 (returns []) or some other 2xx — just not 401/403.
    expect(r.status).toBeLessThan(400);
  });
});
