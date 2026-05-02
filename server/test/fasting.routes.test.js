// Coverage for /api/fasting routes: feed, manual start/end, one-off
// schedule, edits, and deletes. Pattern matches the rest of the route
// suite — supertest agent + login → JWT cookie.

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import FastingEvent from '../src/models/FastingEvent.js';

const app = createApp({ serveClient: false });

async function authedAgent() {
  const agent = request.agent(app);
  const email = `fast-${Math.random().toString(36).slice(2)}@example.com`;
  await agent.post('/api/auth/register').send({ email, password: 'passw0rd-ok' });
  return agent;
}

describe('/api/fasting', () => {
  it('returns an empty event feed for a fresh user', async () => {
    const agent = await authedAgent();
    const res = await agent.get('/api/fasting');
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
  });

  it('starts a manual fast and surfaces it as active', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/fasting/start').send({ durationMinutes: 16 * 60 });
    expect(res.status).toBe(201);
    expect(res.body.event.actualStartAt).toBeTruthy();
    expect(res.body.event.actualEndAt).toBeNull();
    expect(res.body.event.source).toBe('manual_start');

    const feed = await agent.get('/api/fasting');
    expect(feed.body.events).toHaveLength(1);
  });

  it('refuses to start a second fast while one is active', async () => {
    const agent = await authedAgent();
    await agent.post('/api/fasting/start').send({});
    const res = await agent.post('/api/fasting/start').send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('fast_already_active');
  });

  it('ends the active fast', async () => {
    const agent = await authedAgent();
    await agent.post('/api/fasting/start').send({});
    const res = await agent.post('/api/fasting/end').send({});
    expect(res.status).toBe(200);
    expect(res.body.event.actualEndAt).toBeTruthy();

    // No active fast → /end returns 404 next time.
    const second = await agent.post('/api/fasting/end').send({});
    expect(second.status).toBe(404);
  });

  it('schedules a one-off fast', async () => {
    const agent = await authedAgent();
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 18 * 60 * 60 * 1000);
    const res = await agent.post('/api/fasting/one-off').send({
      plannedStartAt: start.toISOString(),
      plannedEndAt: end.toISOString(),
      notes: 'long sunday',
    });
    expect(res.status).toBe(201);
    expect(res.body.event.source).toBe('one_off');
    expect(res.body.event.actualStartAt).toBeNull();
    expect(res.body.event.notes).toBe('long sunday');
  });

  it('rejects a one-off where end <= start', async () => {
    const agent = await authedAgent();
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const res = await agent.post('/api/fasting/one-off').send({
      plannedStartAt: start.toISOString(),
      plannedEndAt: start.toISOString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('end_before_start');
  });

  it('edits and deletes an event', async () => {
    const agent = await authedAgent();
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 12 * 60 * 60 * 1000);
    const create = await agent.post('/api/fasting/one-off').send({
      plannedStartAt: start.toISOString(),
      plannedEndAt: end.toISOString(),
    });
    const id = create.body.event._id;

    const newEnd = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const patch = await agent.patch(`/api/fasting/${id}`).send({
      plannedEndAt: newEnd.toISOString(),
      notes: 'extended',
    });
    expect(patch.status).toBe(200);
    expect(new Date(patch.body.event.plannedEndAt).getTime()).toBe(newEnd.getTime());
    expect(patch.body.event.notes).toBe('extended');

    const del = await agent.del(`/api/fasting/${id}`);
    expect(del.status).toBe(200);
    expect(await FastingEvent.findById(id)).toBeNull();
  });

  it('isolates events by user', async () => {
    const a = await authedAgent();
    const b = await authedAgent();
    await a.post('/api/fasting/start').send({});

    const aFeed = await a.get('/api/fasting');
    const bFeed = await b.get('/api/fasting');
    expect(aFeed.body.events).toHaveLength(1);
    expect(bFeed.body.events).toHaveLength(0);
  });
});
