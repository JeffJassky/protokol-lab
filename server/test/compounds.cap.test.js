// Plan-cap enforcement on POST /api/compounds.
//
// Custom compounds are gated by `storage.customCompounds`. System (built-in)
// compounds are universal and never count. Free=0, Premium=3, Unlimited=∞.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import { PLAN_IDS } from '../../shared/plans.js';

const app = createApp({ serveClient: false });

// Custom compound — name deliberately unique so it doesn't shadow a
// canonical entry in core's PEPTIDE_CATALOG (Tirzepatide, Semaglutide,
// Liraglutide, Dulaglutide, Retatrutide, oral Semaglutide). Canonical
// names + brand names are reserved post-migration.
const VALID_BODY = {
  name: 'BPC-157 custom',
  halfLifeDays: 0.25,
  intervalDays: 1,
  doseUnit: 'mcg',
  kineticsShape: 'subq',
};

async function registerAgent() {
  const email = `u-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, password: 'passw0rd-ok' });
  expect(res.status).toBe(201);
  return { agent, userId: res.body.user.id, email };
}

async function setPlan(userId, planId) {
  await User.findByIdAndUpdate(userId, { plan: planId });
}

describe('POST /api/compounds — plan cap', () => {
  it('Free user (cap=0) is blocked on first custom compound with 403 + plan_limit_exceeded', async () => {
    const { agent } = await registerAgent();
    const res = await agent.post('/api/compounds').send(VALID_BODY);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('plan_limit_exceeded');
    expect(res.body.reason).toBe('storage_cap');
    expect(res.body.limitKey).toBe('customCompounds');
    expect(res.body.limit).toBe(0);
    expect(res.body.used).toBe(0);
    expect(res.body.upgradeAvailable).toBe(true);
    expect(res.body.upgradePlanId).toBe(PLAN_IDS.PREMIUM);
  });

  it('Premium user can create up to 3 custom compounds; 4th is denied', async () => {
    const { agent, userId } = await registerAgent();
    await setPlan(userId, PLAN_IDS.PREMIUM);

    for (let i = 1; i <= 3; i++) {
      const res = await agent.post('/api/compounds').send({ ...VALID_BODY, name: `Custom ${i}` });
      expect(res.status, `creating compound ${i}`).toBe(201);
    }

    const denied = await agent.post('/api/compounds').send({ ...VALID_BODY, name: 'Custom 4' });
    expect(denied.status).toBe(403);
    expect(denied.body.reason).toBe('storage_cap');
    expect(denied.body.limit).toBe(3);
    expect(denied.body.used).toBe(3);
  });

  it('Unlimited user can create more than 3 custom compounds', async () => {
    const { agent, userId } = await registerAgent();
    await setPlan(userId, PLAN_IDS.UNLIMITED);

    for (let i = 1; i <= 5; i++) {
      const res = await agent.post('/api/compounds').send({ ...VALID_BODY, name: `Custom ${i}` });
      expect(res.status, `creating compound ${i}`).toBe(201);
    }
  });

  it('Canonical compounds do NOT count toward the cap', async () => {
    const { agent, userId } = await registerAgent();
    await setPlan(userId, PLAN_IDS.PREMIUM);

    // The canonical-compound migration moved system rows out of the
    // Compound table and onto core's PEPTIDE_CATALOG. The unified GET
    // returns those alongside customs with `source: 'core'`.
    const list = await agent.get('/api/compounds');
    expect(list.status).toBe(200);
    const canonicalCount = list.body.compounds.filter((c) => c.source === 'core').length;
    expect(canonicalCount).toBeGreaterThan(0);

    // Premium cap is 3 custom — canonical compounds in the merged list
    // shouldn't have eaten any of it.
    for (let i = 1; i <= 3; i++) {
      const res = await agent.post('/api/compounds').send({ ...VALID_BODY, name: `Custom ${i}` });
      expect(res.status, `creating compound ${i}`).toBe(201);
    }
  });
});
