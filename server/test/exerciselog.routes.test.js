// Coverage for /api/exerciselog — workout entries that drive the
// dashboard burn series, the rolling weekly budget (in earn mode),
// and the simulation pipeline. Locks in MET-derived calorie math,
// the override-vs-recompute behavior, range/daily aggregation, and
// per-user ownership.

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp({ serveClient: false });

async function authedAgent({ weightLbs = 165 } = {}) {
  const agent = request.agent(app);
  const email = `exlog-${Math.random().toString(36).slice(2)}@example.com`;
  await agent.post('/api/auth/register').send({ email, password: 'passw0rd-ok' });
  // Set weight so MET × kg math is predictable across tests.
  await agent.patch('/api/settings').send({ currentWeightLbs: weightLbs });
  return agent;
}

describe('/api/exerciselog', () => {
  it('returns an empty list for a fresh user', async () => {
    const agent = await authedAgent();
    const res = await agent.get('/api/exerciselog?from=2026-01-01&to=2026-01-07');
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it('rejects missing range params', async () => {
    const agent = await authedAgent();
    const res = await agent.get('/api/exerciselog?from=2026-01-01');
    expect(res.status).toBe(400);
  });

  it('creates a quick-mode entry and computes calories from MET fallback', async () => {
    const agent = await authedAgent({ weightLbs: 165 });
    // Quick mode → no exerciseId, just engineClass + duration.
    // engineClassDefaultMet for cardio = 6.0
    // 165 lbs = ~74.84 kg, 30 min = 0.5 h, intensity 1.0
    // expected: 6 × 74.84 × 0.5 × 1.0 ≈ 224 kcal
    const res = await agent.post('/api/exerciselog').send({
      label: 'Cardio',
      engineClass: 'exercise_cardio',
      durationMin: 30,
      intensity: 1.0,
      date: new Date('2026-01-15T08:30:00Z').toISOString(),
    });
    expect(res.status).toBe(201);
    expect(res.body.entry.caloriesBurned).toBeGreaterThan(200);
    expect(res.body.entry.caloriesBurned).toBeLessThan(250);
  });

  it('uses catalog metValue when an exerciseId is supplied', async () => {
    const agent = await authedAgent({ weightLbs: 165 });
    // Pull Running (jog) from the seeded catalog — MET 7.0
    await agent.get('/api/exercises'); // trigger seed
    const list = await agent.get('/api/exercises');
    const running = list.body.exercises.find((e) => e.name === 'Running (jog)');
    expect(running.metValue).toBe(7.0);

    // 7.0 × 74.84 × 0.5 × 1.0 ≈ 262 kcal
    const res = await agent.post('/api/exerciselog').send({
      exerciseId: running._id,
      durationMin: 30,
      intensity: 1.0,
      date: new Date('2026-01-15T07:00:00Z').toISOString(),
    });
    expect(res.status).toBe(201);
    expect(res.body.entry.caloriesBurned).toBeGreaterThan(240);
    expect(res.body.entry.caloriesBurned).toBeLessThan(290);
  });

  it('respects an explicit caloriesBurned override (e.g. wearable)', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/exerciselog').send({
      label: 'Long ride',
      engineClass: 'exercise_cardio',
      durationMin: 60,
      intensity: 1.0,
      caloriesBurned: 850,
      date: new Date('2026-01-16T07:00:00Z').toISOString(),
    });
    expect(res.body.entry.caloriesBurned).toBe(850);
  });

  it('intensity scales the calorie burn proportionally', async () => {
    const agent = await authedAgent({ weightLbs: 165 });
    const a = await agent.post('/api/exerciselog').send({
      label: 'Cardio @1.0',
      engineClass: 'exercise_cardio',
      durationMin: 30,
      intensity: 1.0,
      date: new Date('2026-01-17T07:00:00Z').toISOString(),
    });
    const b = await agent.post('/api/exerciselog').send({
      label: 'Cardio @1.5',
      engineClass: 'exercise_cardio',
      durationMin: 30,
      intensity: 1.5,
      date: new Date('2026-01-17T08:00:00Z').toISOString(),
    });
    // 1.5× intensity ≈ 1.5× burn (within ±1 from rounding).
    const ratio = b.body.entry.caloriesBurned / a.body.entry.caloriesBurned;
    expect(ratio).toBeGreaterThan(1.45);
    expect(ratio).toBeLessThan(1.55);
  });

  it('clamps intensity into [0.5, 1.5]', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/exerciselog').send({
      label: 'Off-the-charts',
      engineClass: 'exercise_hiit',
      durationMin: 30,
      intensity: 5.0,
      date: new Date('2026-01-18T07:00:00Z').toISOString(),
    });
    expect(res.body.entry.intensity).toBe(1.5);
  });

  it('rejects invalid engineClass', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/exerciselog').send({
      label: 'Quantum',
      engineClass: 'exercise_quantum',
      durationMin: 30,
    });
    expect(res.status).toBe(400);
  });

  it('PUT recomputes caloriesBurned when duration changes', async () => {
    const agent = await authedAgent({ weightLbs: 165 });
    const create = await agent.post('/api/exerciselog').send({
      label: 'Run',
      engineClass: 'exercise_cardio',
      durationMin: 30,
      intensity: 1.0,
      date: new Date('2026-01-20T07:00:00Z').toISOString(),
    });
    const id = create.body.entry._id;
    const initialKcal = create.body.entry.caloriesBurned;

    // Doubling duration should ~double burn (no override sent).
    const update = await agent.put(`/api/exerciselog/${id}`).send({
      durationMin: 60,
    });
    expect(update.status).toBe(200);
    expect(update.body.entry.caloriesBurned).toBeGreaterThan(initialKcal * 1.9);
    expect(update.body.entry.caloriesBurned).toBeLessThan(initialKcal * 2.1);
  });

  it('PUT preserves explicit caloriesBurned when caller passes it', async () => {
    const agent = await authedAgent();
    const create = await agent.post('/api/exerciselog').send({
      label: 'Run',
      engineClass: 'exercise_cardio',
      durationMin: 30,
      caloriesBurned: 300,
      date: new Date('2026-01-20T07:00:00Z').toISOString(),
    });
    const id = create.body.entry._id;

    const update = await agent.put(`/api/exerciselog/${id}`).send({
      durationMin: 45,
      caloriesBurned: 450, // wearable override wins over MET recompute
    });
    expect(update.body.entry.caloriesBurned).toBe(450);
  });

  it('DELETE removes the entry', async () => {
    const agent = await authedAgent();
    const create = await agent.post('/api/exerciselog').send({
      label: 'Yoga',
      engineClass: 'exercise_recovery',
      durationMin: 60,
      date: new Date('2026-01-21T18:00:00Z').toISOString(),
    });
    const id = create.body.entry._id;

    const del = await agent.del(`/api/exerciselog/${id}`);
    expect(del.status).toBe(200);

    const list = await agent.get('/api/exerciselog?from=2026-01-21&to=2026-01-21');
    expect(list.body.entries).toEqual([]);
  });

  it('/daily aggregates per-day burn + duration', async () => {
    const agent = await authedAgent({ weightLbs: 165 });
    await agent.post('/api/exerciselog').send({
      label: 'Morning run', engineClass: 'exercise_cardio',
      durationMin: 30, intensity: 1.0,
      date: new Date('2026-02-01T07:00:00Z').toISOString(),
    });
    await agent.post('/api/exerciselog').send({
      label: 'Evening lifting', engineClass: 'exercise_resistance',
      durationMin: 45, intensity: 1.0,
      date: new Date('2026-02-01T18:00:00Z').toISOString(),
    });
    await agent.post('/api/exerciselog').send({
      label: 'Yoga', engineClass: 'exercise_recovery',
      durationMin: 30, intensity: 1.0,
      date: new Date('2026-02-02T08:00:00Z').toISOString(),
    });

    const res = await agent.get('/api/exerciselog/daily?from=2026-02-01&to=2026-02-02');
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(2);
    const feb1 = res.body.days.find((d) => d.date === '2026-02-01');
    expect(feb1.count).toBe(2);
    expect(feb1.durationMin).toBe(75);
    expect(feb1.caloriesBurned).toBeGreaterThan(0);
  });

  it('/range-events returns per-event payload for the simulation worker', async () => {
    const agent = await authedAgent();
    await agent.post('/api/exerciselog').send({
      label: 'HIIT', engineClass: 'exercise_hiit',
      durationMin: 20, intensity: 1.2,
      date: new Date('2026-03-05T06:30:00Z').toISOString(),
    });
    const res = await agent.get('/api/exerciselog/range-events?from=2026-03-01&to=2026-03-31');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    const ev = res.body.events[0];
    expect(ev.engineClass).toBe('exercise_hiit');
    expect(ev.durationMin).toBe(20);
    expect(ev.timestamp).toBeTruthy();
  });

  it('isolates entries by user', async () => {
    const a = await authedAgent();
    const b = await authedAgent();
    await a.post('/api/exerciselog').send({
      label: 'Ride', engineClass: 'exercise_cardio',
      durationMin: 60, intensity: 1.0,
      date: new Date('2026-04-01T07:00:00Z').toISOString(),
    });

    const aList = await a.get('/api/exerciselog?from=2026-04-01&to=2026-04-01');
    const bList = await b.get('/api/exerciselog?from=2026-04-01&to=2026-04-01');
    expect(aList.body.entries).toHaveLength(1);
    expect(bList.body.entries).toHaveLength(0);
  });
});
