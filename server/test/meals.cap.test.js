// Plan-cap enforcement on POST /api/meals.
// Caps: Free=5, Premium=Infinity, Unlimited=Infinity. No built-in meals exist.

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import { PLAN_IDS } from '../../shared/plans.js';

const app = createApp({ serveClient: false });

async function registerAgent() {
  const email = `u-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, password: 'passw0rd-ok' });
  expect(res.status).toBe(201);
  return { agent, userId: res.body.user.id };
}

async function setPlan(userId, planId) {
  await User.findByIdAndUpdate(userId, { plan: planId });
}

async function createMeal(agent, name) {
  return agent.post('/api/meals').send({ name, emoji: '🥗', items: [] });
}

describe('POST /api/meals — plan cap', () => {
  it('Free user can create up to 5 meals; 6th is denied with 403', async () => {
    const { agent } = await registerAgent();

    for (let i = 1; i <= 5; i++) {
      const res = await createMeal(agent, `Meal ${i}`);
      expect(res.status, `meal ${i}`).toBe(201);
    }

    const denied = await createMeal(agent, 'Meal 6');
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('plan_limit_exceeded');
    expect(denied.body.reason).toBe('storage_cap');
    expect(denied.body.limitKey).toBe('savedMeals');
    expect(denied.body.limit).toBe(5);
    expect(denied.body.used).toBe(5);
    expect(denied.body.upgradeAvailable).toBe(true);
    expect(denied.body.upgradePlanId).toBe(PLAN_IDS.PREMIUM);
  });

  it('Premium user can create more than 5 meals (uncapped)', async () => {
    const { agent, userId } = await registerAgent();
    await setPlan(userId, PLAN_IDS.PREMIUM);

    for (let i = 1; i <= 7; i++) {
      const res = await createMeal(agent, `Meal ${i}`);
      expect(res.status, `meal ${i}`).toBe(201);
    }
  });
});
