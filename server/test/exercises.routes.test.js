// Coverage for /api/exercises — the user-scoped exercise catalog. System
// rows seed lazily on first GET (mirrors the Compounds pattern); custom
// rows go through validation. Locks in engine-class enum, the
// soft-delete behavior for system rows, and per-user isolation.

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp({ serveClient: false });

async function authedAgent() {
  const agent = request.agent(app);
  const email = `ex-${Math.random().toString(36).slice(2)}@example.com`;
  await agent.post('/api/auth/register').send({ email, password: 'passw0rd-ok' });
  return agent;
}

describe('/api/exercises', () => {
  it('seeds system exercises on first GET', async () => {
    const agent = await authedAgent();
    const res = await agent.get('/api/exercises');
    expect(res.status).toBe(200);
    expect(res.body.exercises.length).toBeGreaterThanOrEqual(20);
    // Spot-check that cardio/resistance/hiit/recovery are all represented
    // — one of each so the picker has every class available.
    const classes = new Set(res.body.exercises.map((e) => e.engineClass));
    expect(classes.has('exercise_cardio')).toBe(true);
    expect(classes.has('exercise_resistance')).toBe(true);
    expect(classes.has('exercise_hiit')).toBe(true);
    expect(classes.has('exercise_recovery')).toBe(true);
  });

  it('reclassifies Yoga + Pilates as recovery (not resistance)', async () => {
    const agent = await authedAgent();
    const res = await agent.get('/api/exercises');
    const yoga = res.body.exercises.find((e) => e.name === 'Yoga');
    const pilates = res.body.exercises.find((e) => e.name === 'Pilates');
    expect(yoga.engineClass).toBe('exercise_recovery');
    expect(pilates.engineClass).toBe('exercise_recovery');
  });

  it('seed is idempotent — second GET returns the same row count', async () => {
    const agent = await authedAgent();
    const a = await agent.get('/api/exercises');
    const b = await agent.get('/api/exercises');
    expect(a.body.exercises.length).toBe(b.body.exercises.length);
  });

  it('creates a custom exercise', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/exercises').send({
      name: 'Mountain biking',
      engineClass: 'exercise_cardio',
      metValue: 8.5,
      defaultDurationMin: 60,
    });
    expect(res.status).toBe(201);
    expect(res.body.exercise.name).toBe('Mountain biking');
    expect(res.body.exercise.isSystem).toBe(false);
    expect(res.body.exercise.metValue).toBe(8.5);
  });

  it('rejects custom exercise with invalid engineClass', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/exercises').send({
      name: 'Underwater basket weaving',
      engineClass: 'exercise_cosmic',
      metValue: 4.0,
    });
    expect(res.status).toBe(400);
  });

  it('rejects custom exercise with metValue < 1', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/exercises').send({
      name: 'Levitating',
      engineClass: 'exercise_recovery',
      metValue: 0.5,
    });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate name (per-user unique index)', async () => {
    const agent = await authedAgent();
    await agent.post('/api/exercises').send({
      name: 'My custom run',
      engineClass: 'exercise_cardio',
      metValue: 7.0,
    });
    const dup = await agent.post('/api/exercises').send({
      name: 'My custom run',
      engineClass: 'exercise_cardio',
      metValue: 7.0,
    });
    expect(dup.status).toBe(409);
  });

  it('PATCH updates allowed fields and clamps intensity', async () => {
    const agent = await authedAgent();
    const create = await agent.post('/api/exercises').send({
      name: 'Cycling commute',
      engineClass: 'exercise_cardio',
      metValue: 6.0,
    });
    const id = create.body.exercise._id;

    const patch = await agent.patch(`/api/exercises/${id}`).send({
      defaultIntensity: 2.0, // out of bounds (max 1.5)
      metValue: 7.5,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.exercise.metValue).toBe(7.5);
    // Intensity clamped to max 1.5
    expect(patch.body.exercise.defaultIntensity).toBe(1.5);
  });

  it('DELETE on system row → soft-disables, does not remove', async () => {
    const agent = await authedAgent();
    const list = await agent.get('/api/exercises');
    const yoga = list.body.exercises.find((e) => e.name === 'Yoga');
    expect(yoga.isSystem).toBe(true);

    const del = await agent.del(`/api/exercises/${yoga._id}`);
    expect(del.status).toBe(200);
    expect(del.body.disabled).toBe(true);
    expect(del.body.deleted).toBeUndefined();

    // Row still exists, just with enabled=false.
    const after = await agent.get('/api/exercises');
    const yogaAfter = after.body.exercises.find((e) => e._id === yoga._id);
    expect(yogaAfter).toBeDefined();
    expect(yogaAfter.enabled).toBe(false);
  });

  it('DELETE on custom row → fully deletes', async () => {
    const agent = await authedAgent();
    const create = await agent.post('/api/exercises').send({
      name: 'Frisbee golf',
      engineClass: 'exercise_cardio',
      metValue: 4.0,
    });
    const id = create.body.exercise._id;

    const del = await agent.del(`/api/exercises/${id}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const after = await agent.get('/api/exercises');
    expect(after.body.exercises.find((e) => e._id === id)).toBeUndefined();
  });

  it('isolates exercises by user', async () => {
    const a = await authedAgent();
    const b = await authedAgent();
    await a.post('/api/exercises').send({
      name: "A's secret circuit",
      engineClass: 'exercise_hiit',
      metValue: 9.0,
    });

    const aList = await a.get('/api/exercises');
    const bList = await b.get('/api/exercises');
    expect(aList.body.exercises.find((e) => e.name === "A's secret circuit")).toBeDefined();
    expect(bList.body.exercises.find((e) => e.name === "A's secret circuit")).toBeUndefined();
  });
});
