// CRUD ownership: prove user A can NEVER read or mutate user B's data.
//
// This is the single highest-value integration test in the suite. A regression
// here is a data leak — worse than any feature bug. We check the same contract
// across every resource owned by a user: list filters by userId; GET-by-id,
// PUT, DELETE for another user's row return 404 (never 403/200).
//
// Covered: /api/weight, /api/foodlog, /api/doses, /api/compounds, /api/notes.
// Each resource gets: "A cannot see B's rows on list" + "A cannot delete/modify
// B's row by id" pattern.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import FoodItem from '../src/models/FoodItem.js';
import Compound from '../src/models/Compound.js';

const app = createApp({ serveClient: false });

async function registerAgent(email = `u-${Math.random().toString(36).slice(2, 8)}@example.com`) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, password: 'passw0rd-ok' });
  expect(res.status).toBe(201);
  return { agent, userId: res.body.user.id, email };
}

// -----------------------------------------------------------------------------
// /api/weight
// -----------------------------------------------------------------------------
describe('weight — ownership', () => {
  let alice, bob, aliceEntryId, bobEntryId;

  beforeEach(async () => {
    alice = await registerAgent();
    bob = await registerAgent();

    const a = await alice.agent.post('/api/weight').send({ weightLbs: 180, date: '2026-04-01' });
    const b = await bob.agent.post('/api/weight').send({ weightLbs: 150, date: '2026-04-01' });
    aliceEntryId = a.body.entry._id;
    bobEntryId = b.body.entry._id;
  });

  it('GET /api/weight returns only caller entries', async () => {
    const a = await alice.agent.get('/api/weight');
    expect(a.body.entries).toHaveLength(1);
    expect(a.body.entries[0]._id).toBe(aliceEntryId);

    const b = await bob.agent.get('/api/weight');
    expect(b.body.entries).toHaveLength(1);
    expect(b.body.entries[0]._id).toBe(bobEntryId);
  });

  it("DELETE on another user's entry returns 404", async () => {
    const res = await alice.agent.delete(`/api/weight/${bobEntryId}`);
    expect(res.status).toBe(404);
    // Bob's row still exists.
    const b = await bob.agent.get('/api/weight');
    expect(b.body.entries).toHaveLength(1);
  });

  it('stats reflect only caller entries', async () => {
    await alice.agent.post('/api/weight').send({ weightLbs: 178, date: '2026-04-08' });
    const a = await alice.agent.get('/api/weight/stats');
    expect(a.body.stats.currentWeight).toBe(178);

    const b = await bob.agent.get('/api/weight/stats');
    expect(b.body.stats.currentWeight).toBe(150);
  });
});

// -----------------------------------------------------------------------------
// /api/foodlog
// -----------------------------------------------------------------------------
describe('foodlog — ownership', () => {
  let alice, bob, foodItem, aliceEntryId, bobEntryId;

  beforeEach(async () => {
    alice = await registerAgent();
    bob = await registerAgent();
    // FoodItem is now per-user, so each test user gets their own copy.
    const aliceFood = await FoodItem.create({
      userId: alice.userId,
      name: 'Chicken breast',
      caloriesPer: 165,
      proteinPer: 31,
      fatPer: 3.6,
      carbsPer: 0,
    });
    const bobFood = await FoodItem.create({
      userId: bob.userId,
      name: 'Chicken breast',
      caloriesPer: 165,
      proteinPer: 31,
      fatPer: 3.6,
      carbsPer: 0,
    });
    foodItem = aliceFood; // legacy var name reused by downstream specs

    const a = await alice.agent.post('/api/foodlog').send({
      foodItemId: String(aliceFood._id),
      date: '2026-04-01',
      mealType: 'lunch',
      servingCount: 2,
    });
    const b = await bob.agent.post('/api/foodlog').send({
      foodItemId: String(bobFood._id),
      date: '2026-04-01',
      mealType: 'dinner',
      servingCount: 1,
    });
    aliceEntryId = a.body.entry._id;
    bobEntryId = b.body.entry._id;
  });

  it('GET /api/foodlog for a day returns only caller entries', async () => {
    const a = await alice.agent.get('/api/foodlog').query({ date: '2026-04-01' });
    const aAll = [...a.body.entries.breakfast, ...a.body.entries.lunch, ...a.body.entries.dinner, ...a.body.entries.snack];
    expect(aAll).toHaveLength(1);
    expect(aAll[0]._id).toBe(aliceEntryId);

    const b = await bob.agent.get('/api/foodlog').query({ date: '2026-04-01' });
    const bAll = [...b.body.entries.breakfast, ...b.body.entries.lunch, ...b.body.entries.dinner, ...b.body.entries.snack];
    expect(bAll).toHaveLength(1);
    expect(bAll[0]._id).toBe(bobEntryId);
  });

  it("PUT on another user's entry returns 404 and does not mutate", async () => {
    const res = await alice.agent.put(`/api/foodlog/${bobEntryId}`).send({ servingCount: 99 });
    expect(res.status).toBe(404);
    // Bob's record still has servingCount=1.
    const b = await bob.agent.get('/api/foodlog').query({ date: '2026-04-01' });
    const bEntry = b.body.entries.dinner[0];
    expect(bEntry.servingCount).toBe(1);
  });

  it("DELETE on another user's entry returns 404", async () => {
    const res = await alice.agent.delete(`/api/foodlog/${bobEntryId}`);
    expect(res.status).toBe(404);
    const b = await bob.agent.get('/api/foodlog').query({ date: '2026-04-01' });
    const bAll = [...b.body.entries.breakfast, ...b.body.entries.lunch, ...b.body.entries.dinner, ...b.body.entries.snack];
    expect(bAll).toHaveLength(1);
  });

  it("POST /copy cannot copy another user's entry", async () => {
    // Alice tries to copy Bob's entry. Sources filtered by userId so no match.
    const res = await alice.agent.post('/api/foodlog/copy').send({
      entryIds: [bobEntryId],
      dates: ['2026-04-10'],
    });
    expect(res.status).toBe(404);
  });

  it("POST /move cannot move another user's entry", async () => {
    const res = await alice.agent.post('/api/foodlog/move').send({
      entryIds: [bobEntryId],
      dates: ['2026-04-10'],
    });
    expect(res.status).toBe(404);
    // Bob still has it.
    const b = await bob.agent.get('/api/foodlog').query({ date: '2026-04-01' });
    const bAll = [...b.body.entries.breakfast, ...b.body.entries.lunch, ...b.body.entries.dinner, ...b.body.entries.snack];
    expect(bAll).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
// /api/compounds + /api/doses
// -----------------------------------------------------------------------------
describe('compounds + doses — ownership', () => {
  let alice, bob, aliceCompound, bobCompound;

  beforeEach(async () => {
    alice = await registerAgent();
    bob = await registerAgent();

    aliceCompound = await Compound.create({
      userId: alice.userId, name: 'Alice-Sema',
      halfLifeDays: 7, intervalDays: 7,
    });
    bobCompound = await Compound.create({
      userId: bob.userId, name: 'Bob-Tirz',
      halfLifeDays: 5, intervalDays: 7,
    });
  });

  it('GET /api/compounds returns only caller compounds (seeded defaults + own, never the other user)', async () => {
    // The compounds endpoint auto-seeds system defaults per user on first
    // read, so both users get the catalog plus their own entry — but never
    // the other user's.
    const a = await alice.agent.get('/api/compounds');
    const aNames = a.body.compounds.map((c) => c.name);
    expect(aNames).toContain('Alice-Sema');
    expect(aNames).not.toContain('Bob-Tirz');

    const b = await bob.agent.get('/api/compounds');
    const bNames = b.body.compounds.map((c) => c.name);
    expect(bNames).toContain('Bob-Tirz');
    expect(bNames).not.toContain('Alice-Sema');
  });

  it("PATCH on another user's compound returns 404", async () => {
    const res = await alice.agent
      .patch(`/api/compounds/${bobCompound._id}`)
      .send({ name: 'hijacked' });
    expect(res.status).toBe(404);
    const fresh = await Compound.findById(bobCompound._id);
    expect(fresh.name).toBe('Bob-Tirz');
  });

  it("DELETE on another user's compound returns 404", async () => {
    const res = await alice.agent.delete(`/api/compounds/${bobCompound._id}`);
    expect(res.status).toBe(404);
    const stillThere = await Compound.findById(bobCompound._id);
    expect(stillThere).toBeTruthy();
  });

  it("POST /api/doses with another user's compoundId is rejected", async () => {
    const res = await alice.agent.post('/api/doses').send({
      compoundId: String(bobCompound._id),
      value: 0.5,
      date: '2026-04-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid compoundid/i);
  });

  it('dose list / delete respect ownership', async () => {
    const aDose = await alice.agent.post('/api/doses').send({
      compoundId: String(aliceCompound._id), value: 0.5, date: '2026-04-01',
    });
    const bDose = await bob.agent.post('/api/doses').send({
      compoundId: String(bobCompound._id), value: 5, date: '2026-04-01',
    });
    expect(aDose.status).toBe(201);
    expect(bDose.status).toBe(201);

    const a = await alice.agent.get('/api/doses');
    expect(a.body.entries).toHaveLength(1);
    expect(a.body.entries[0]._id).toBe(aDose.body.entry._id);

    const delCross = await alice.agent.delete(`/api/doses/${bDose.body.entry._id}`);
    expect(delCross.status).toBe(404);

    const bStill = await bob.agent.get('/api/doses');
    expect(bStill.body.entries).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
// /api/notes
// -----------------------------------------------------------------------------
describe('notes — ownership', () => {
  let alice, bob;

  beforeEach(async () => {
    alice = await registerAgent();
    bob = await registerAgent();
    await alice.agent.put('/api/notes').send({ date: '2026-04-01', text: 'alice secret' });
    await bob.agent.put('/api/notes').send({ date: '2026-04-01', text: 'bob secret' });
  });

  it('each user sees only their own note for a day', async () => {
    const a = await alice.agent.get('/api/notes').query({ date: '2026-04-01' });
    expect(a.body.note.text).toBe('alice secret');
    const b = await bob.agent.get('/api/notes').query({ date: '2026-04-01' });
    expect(b.body.note.text).toBe('bob secret');
  });

  it('range endpoint scopes to caller', async () => {
    const a = await alice.agent.get('/api/notes/range').query({ from: '2026-04-01', to: '2026-04-01' });
    expect(a.body.notes).toEqual([{ date: '2026-04-01', text: 'alice secret' }]);
    const b = await bob.agent.get('/api/notes/range').query({ from: '2026-04-01', to: '2026-04-01' });
    expect(b.body.notes).toEqual([{ date: '2026-04-01', text: 'bob secret' }]);
  });

  it('PUT by same date from user A does not touch user B', async () => {
    await alice.agent.put('/api/notes').send({ date: '2026-04-01', text: 'alice updated' });
    const b = await bob.agent.get('/api/notes').query({ date: '2026-04-01' });
    expect(b.body.note.text).toBe('bob secret');
  });
});
