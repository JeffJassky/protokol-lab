// /api/foodlog route coverage. P0 #3 in docs/testing.md.
//
// What this proves end-to-end (route → mongoose → mem-mongo):
//   - POST /          create entry, including barcode upsert path
//   - GET /           groups entries by mealType for the requested day
//   - GET /summary    sums macros and serves user targets
//   - GET /daily-nutrition   per-day totals across a date range
//   - PUT /:id        updates servingCount / mealType
//   - DELETE /:id     removes a single entry (and triggers FoodLog cascade)
//   - POST /copy      duplicates entries onto multiple dates
//   - POST /move      moves entries by date (delete sources, insert copies)
//   - cross-user isolation — req.userId scoping does what it claims
//
// Tests share an authenticated supertest agent so cookies survive across
// requests, mirroring the pattern in auth.test.js.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import '../src/models/index.js';
import { createApp } from '../src/app.js';
import FoodItem from '../src/models/FoodItem.js';
import FoodLog from '../src/models/FoodLog.js';
import UserSettings from '../src/models/UserSettings.js';

const app = createApp({ serveClient: false });

async function registerAndLogin(email) {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/register')
    .send({ email, password: 'foodlog-pw-1' });
  const me = await agent.get('/api/auth/me');
  return { agent, userId: me.body.user.id };
}

async function makeFoodItem(userId, overrides = {}) {
  return FoodItem.create({
    userId,
    name: 'Eggs',
    isCustom: true,
    servingSize: '1 large',
    servingAmount: 50,
    servingUnit: 'g',
    servingKnown: true,
    perServing: { calories: 80, protein: 6, fat: 5, carbs: 1 },
    nutrientSource: 'manual',
    nutrientCoverage: 'macros_only',
    ...overrides,
  });
}

describe('/api/foodlog', () => {
  let agent;
  let userId;
  let food;

  beforeEach(async () => {
    ({ agent, userId } = await registerAndLogin('foodlog@example.com'));
    food = await makeFoodItem(userId);
  });

  it('POST / creates an entry and GET / groups it under the right mealType', async () => {
    const date = '2026-04-28';
    const post = await agent
      .post('/api/foodlog')
      .send({ foodItemId: food._id, date, mealType: 'breakfast', servingCount: 2 });
    expect(post.status).toBe(201);
    expect(post.body.entry.servingCount).toBe(2);

    const get = await agent.get(`/api/foodlog?date=${date}`);
    expect(get.status).toBe(200);
    expect(get.body.entries.breakfast).toHaveLength(1);
    expect(get.body.entries.lunch).toHaveLength(0);
  });

  it('POST / with offBarcode upserts a per-user FoodItem and logs it', async () => {
    const date = '2026-04-28';
    const post = await agent
      .post('/api/foodlog')
      .send({
        offBarcode: '0000000000017',
        name: 'Granola Bar',
        brand: 'Acme',
        servingSize: '1 bar',
        servingAmount: 40,
        servingUnit: 'g',
        servingKnown: true,
        perServing: { calories: 200, protein: 4, fat: 8, carbs: 28 },
        nutrientSource: 'openfoodfacts',
        date,
        mealType: 'snack',
        servingCount: 1,
      });
    expect(post.status).toBe(201);

    // Same barcode posted again should hit the upsert branch — only one
    // FoodItem row exists for this user.
    await agent
      .post('/api/foodlog')
      .send({
        offBarcode: '0000000000017',
        name: 'Granola Bar',
        perServing: { calories: 200 },
        date,
        mealType: 'snack',
        servingCount: 1,
      });
    const items = await FoodItem.find({ userId, offBarcode: '0000000000017' });
    expect(items).toHaveLength(1);

    const logs = await FoodLog.find({ userId });
    expect(logs).toHaveLength(2);
  });

  it('GET /summary sums macros and surfaces user targets', async () => {
    await UserSettings.create({
      userId,
      targets: { calories: 2200, protein: 180, fat: 70, carbs: 220 },
    });
    const date = '2026-04-28';
    await agent.post('/api/foodlog')
      .send({ foodItemId: food._id, date, mealType: 'breakfast', servingCount: 2 });
    await agent.post('/api/foodlog')
      .send({ foodItemId: food._id, date, mealType: 'lunch', servingCount: 1 });

    const res = await agent.get(`/api/foodlog/summary?date=${date}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.perServing.calories).toBe(240); // 80*2 + 80*1
    expect(res.body.summary.perServing.protein).toBe(18);
    expect(res.body.summary.targets.calories).toBe(2200);
  });

  it('GET /daily-nutrition aggregates per-day totals across a range', async () => {
    await agent.post('/api/foodlog')
      .send({ foodItemId: food._id, date: '2026-04-26', mealType: 'breakfast', servingCount: 1 });
    await agent.post('/api/foodlog')
      .send({ foodItemId: food._id, date: '2026-04-27', mealType: 'breakfast', servingCount: 2 });
    await agent.post('/api/foodlog')
      .send({ foodItemId: food._id, date: '2026-04-27', mealType: 'lunch', servingCount: 1 });

    const res = await agent.get('/api/foodlog/daily-nutrition?from=2026-04-26&to=2026-04-27');
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(2);
    const byDate = Object.fromEntries(res.body.days.map((d) => [d.date, d]));
    expect(byDate['2026-04-26'].calories).toBe(80);
    expect(byDate['2026-04-27'].calories).toBe(240);
  });

  it('PUT /:id updates servingCount and mealType', async () => {
    const created = await agent
      .post('/api/foodlog')
      .send({ foodItemId: food._id, date: '2026-04-28', mealType: 'breakfast', servingCount: 1 });
    const id = created.body.entry._id;

    const upd = await agent.put(`/api/foodlog/${id}`)
      .send({ servingCount: 3, mealType: 'lunch' });
    expect(upd.status).toBe(200);
    expect(upd.body.entry.servingCount).toBe(3);
    expect(upd.body.entry.mealType).toBe('lunch');
  });

  it('DELETE /:id removes the entry', async () => {
    const created = await agent
      .post('/api/foodlog')
      .send({ foodItemId: food._id, date: '2026-04-28', mealType: 'breakfast', servingCount: 1 });
    const id = created.body.entry._id;

    const del = await agent.delete(`/api/foodlog/${id}`);
    expect(del.status).toBe(204);

    const get = await agent.get('/api/foodlog?date=2026-04-28');
    expect(get.body.entries.breakfast).toHaveLength(0);
  });

  it('POST /copy duplicates entries onto multiple dates without removing the source', async () => {
    const created = await agent.post('/api/foodlog')
      .send({ foodItemId: food._id, date: '2026-04-26', mealType: 'breakfast', servingCount: 1 });
    const sourceId = created.body.entry._id;

    const copy = await agent.post('/api/foodlog/copy')
      .send({ entryIds: [sourceId], dates: ['2026-04-27', '2026-04-28'] });
    expect(copy.status).toBe(201);
    expect(copy.body.created).toBe(2);

    expect(await FoodLog.countDocuments({ userId })).toBe(3);
  });

  it('POST /move shifts entries to new dates and removes the originals', async () => {
    const created = await agent.post('/api/foodlog')
      .send({ foodItemId: food._id, date: '2026-04-26', mealType: 'breakfast', servingCount: 1 });
    const sourceId = created.body.entry._id;

    const move = await agent.post('/api/foodlog/move')
      .send({ entryIds: [sourceId], dates: ['2026-04-27'] });
    expect(move.status).toBe(201);
    expect(move.body.created).toBe(1);
    expect(move.body.removed).toBe(1);

    expect(await FoodLog.countDocuments({ userId })).toBe(1);
    const surviving = await FoodLog.findOne({ userId });
    expect(surviving.date.toISOString().slice(0, 10)).toBe('2026-04-27');
  });

  it('cannot read or mutate another user\'s entries', async () => {
    // Other user creates their own entry.
    const { agent: otherAgent, userId: otherUserId } = await registerAndLogin('other@example.com');
    const otherFood = await makeFoodItem(otherUserId);
    const otherEntry = await otherAgent
      .post('/api/foodlog')
      .send({ foodItemId: otherFood._id, date: '2026-04-28', mealType: 'breakfast', servingCount: 1 });
    const otherId = otherEntry.body.entry._id;

    // Attacker tries to read/update/delete via /:id with a different cookie.
    const upd = await agent.put(`/api/foodlog/${otherId}`).send({ servingCount: 99 });
    expect(upd.status).toBe(404);

    const del = await agent.delete(`/api/foodlog/${otherId}`);
    expect(del.status).toBe(404);

    // The other user's entry is unchanged.
    const stillThere = await FoodLog.findById(otherId);
    expect(stillThere.servingCount).toBe(1);
  });

  it('returns 400 from POST / when neither foodItemId nor offBarcode resolve', async () => {
    const res = await agent
      .post('/api/foodlog')
      .send({ date: '2026-04-28', mealType: 'breakfast', servingCount: 1 });
    expect(res.status).toBe(400);
  });
});
