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
    perServing: { calories: 80 },
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

    // Tirzepatide is a canonical compound post-migration — referenced
    // via coreInterventionKey, not a Compound _id.
    const dose = await agent.post('/api/doses').send({
      coreInterventionKey: tirz.coreInterventionKey,
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

    // Demo is pre-register only — the sandbox is destroyed at register time,
    // not left for the cleanup cron. (See routes/auth.js wipeDemoForAuthedSession.)
    expect(await User.findById(start.body.sandboxId)).toBeNull();
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

  it('logout → can start a fresh demo (lifecycle round-trip)', async () => {
    await seedTemplate();

    // Register, log out, log back in to demonstrate a real authed session.
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'looper@example.com',
      password: 'passw0rd-ok',
    });
    // While authed: demo is unavailable.
    let blocked = await agent.post('/api/demo/start');
    expect(blocked.status).toBe(400);
    expect(blocked.body.error).toBe('already_authenticated');

    // Logout.
    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);

    // Now /demo/start works again — fresh anon sandbox.
    const start = await agent.post('/api/demo/start');
    expect(start.status).toBe(201);
    expect(start.body.mode).toBe('anon');
    expect(start.body.sandboxId).toBeDefined();
  });

  it('login from an active demo session destroys the demo (cookie cleared, sandbox deleted)', async () => {
    await seedTemplate();
    const a = request.agent(app);
    await a.post('/api/auth/register').send({
      email: 'returning2@example.com',
      password: 'passw0rd-ok',
    });

    // Visitor in a demo, then logs in to existing acct (same browser).
    const b = request.agent(app);
    const start = await b.post('/api/demo/start');
    const sandboxId = start.body.sandboxId;
    expect(sandboxId).toBeTruthy();

    const login = await b.post('/api/auth/login').send({
      email: 'returning2@example.com',
      password: 'passw0rd-ok',
    });
    expect(login.status).toBe(200);

    // Demo cookie was cleared on login response.
    const demoCookie = findCookie(setCookies(login), 'demo_token');
    expect(demoCookie, 'login response must clear demo_token cookie').toBeTruthy();
    const cleared =
      /expires=Thu, 01 Jan 1970/i.test(demoCookie) ||
      /max-age=0\b/i.test(demoCookie) ||
      /max-age=-\d+/i.test(demoCookie);
    expect(cleared).toBe(true);

    // The anon sandbox was deleted.
    expect(await User.findById(sandboxId)).toBeNull();

    // /api/auth/me works — auth identity is the real user.
    const me = await b.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('returning2@example.com');

    // /api/demo/status reports authed (no sandbox).
    const status = await b.get('/api/demo/status');
    expect(status.body.mode).toBe('authed');
    expect(status.body.sandboxId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pre-register-only demo: once authed, demo is destroyed and unavailable.
// ---------------------------------------------------------------------------
describe('Demo is pre-register only', () => {
  beforeAll(async () => { await User.syncIndexes(); });
  beforeEach(clearAll);

  it('authed user cannot start a fresh demo', async () => {
    await seedTemplate();
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      email: 'noredemo@example.com',
      password: 'passw0rd-ok',
    });
    const res = await agent.post('/api/demo/start');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('already_authenticated');
  });

  it('register from inside an anon demo deletes the sandbox doc', async () => {
    await seedTemplate();
    const agent = request.agent(app);
    const start = await agent.post('/api/demo/start');
    const sandboxId = start.body.sandboxId;
    expect(await User.findById(sandboxId)).not.toBeNull();

    await agent.post('/api/auth/register').send({
      email: 'converter@example.com',
      password: 'passw0rd-ok',
    });
    expect(await User.findById(sandboxId)).toBeNull();
  });

  it('login wipes any parented sandbox + clears activeProfileId (legacy cleanup)', async () => {
    await seedTemplate();

    // Set up a real user with a grandfathered parented sandbox.
    const setup = request.agent(app);
    const reg = await setup.post('/api/auth/register').send({
      email: 'legacy@example.com',
      password: 'passw0rd-ok',
    });
    const userId = reg.body.user.id;
    const { getOrCreateSandbox } = await import('../src/services/demo.js');
    const { sandbox } = await getOrCreateSandbox({ authUserId: userId });
    await User.updateOne({ _id: userId }, { $set: { activeProfileId: sandbox._id } });

    // Fresh agent → log in. Cleanup runs.
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({
      email: 'legacy@example.com',
      password: 'passw0rd-ok',
    });
    expect(login.status).toBe(200);

    expect(await User.findById(sandbox._id)).toBeNull();
    const reloaded = await User.findById(userId);
    expect(reloaded.activeProfileId).toBeNull();
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

  it('authed user with grandfathered activeProfileId blocked from /api/chat (requireRealProfile)', async () => {
    // The /enter route is gone, but requireRealProfile still has to refuse
    // any session whose data scope is a sandbox — defends against legacy
    // records before the next login() wipes them.
    await seedTemplate();
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({
      email: 'd@example.com', password: 'passw0rd-ok',
    });
    const userId = reg.body.user.id;
    const { getOrCreateSandbox } = await import('../src/services/demo.js');
    const { sandbox } = await getOrCreateSandbox({ authUserId: userId });
    await User.updateOne({ _id: userId }, { $set: { activeProfileId: sandbox._id } });
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
