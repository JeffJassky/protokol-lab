// Coverage for /api/day-status routes — the universal day-disposition
// store that powers gap-aware rolling-window math (see
// docs/tracked-untracked-days.md). Locks in the reason × status
// validation, idempotent upsert, and per-user ownership.

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import DayStatus from '../src/models/DayStatus.js';

const app = createApp({ serveClient: false });

async function authedAgent() {
  const agent = request.agent(app);
  const email = `daystatus-${Math.random().toString(36).slice(2)}@example.com`;
  await agent.post('/api/auth/register').send({ email, password: 'passw0rd-ok' });
  return agent;
}

describe('/api/day-status', () => {
  it('returns an empty list for a fresh user', async () => {
    const agent = await authedAgent();
    const res = await agent.get('/api/day-status?from=2026-01-01&to=2026-01-07');
    expect(res.status).toBe(200);
    expect(res.body.rows).toEqual([]);
  });

  it('rejects missing or malformed range params', async () => {
    const agent = await authedAgent();
    const noFrom = await agent.get('/api/day-status?to=2026-01-07');
    expect(noFrom.status).toBe(400);
    const badFmt = await agent.get('/api/day-status?from=2026/01/01&to=2026-01-07');
    expect(badFmt.status).toBe(400);
  });

  it('upserts a tracked + fasted row', async () => {
    const agent = await authedAgent();
    const res = await agent.put('/api/day-status').send({
      date: '2026-01-15',
      status: 'tracked',
      reason: 'fasted',
    });
    expect(res.status).toBe(200);
    expect(res.body.row.status).toBe('tracked');
    expect(res.body.row.reason).toBe('fasted');
  });

  it('upserts an untracked + vacation row', async () => {
    const agent = await authedAgent();
    const res = await agent.put('/api/day-status').send({
      date: '2026-02-10',
      status: 'untracked',
      reason: 'vacation',
    });
    expect(res.status).toBe(200);
    expect(res.body.row.status).toBe('untracked');
    expect(res.body.row.reason).toBe('vacation');
  });

  it('normalizes invalid status×reason combos to "other"', async () => {
    const agent = await authedAgent();
    // tracked + partial is contradictory; server should normalize reason.
    const a = await agent.put('/api/day-status').send({
      date: '2026-03-01',
      status: 'tracked',
      reason: 'partial',
    });
    expect(a.status).toBe(200);
    expect(a.body.row.reason).toBe('other');

    // untracked + fasted is meaningless; same treatment.
    const b = await agent.put('/api/day-status').send({
      date: '2026-03-02',
      status: 'untracked',
      reason: 'fasted',
    });
    expect(b.status).toBe(200);
    expect(b.body.row.reason).toBe('other');
  });

  it('rejects an invalid status', async () => {
    const agent = await authedAgent();
    const res = await agent.put('/api/day-status').send({
      date: '2026-01-15',
      status: 'maybe',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed date', async () => {
    const agent = await authedAgent();
    const res = await agent.put('/api/day-status').send({
      date: '01/15/2026',
      status: 'tracked',
    });
    expect(res.status).toBe(400);
  });

  it('idempotent upsert: same date overwrites prior row', async () => {
    const agent = await authedAgent();
    await agent.put('/api/day-status').send({
      date: '2026-04-01',
      status: 'untracked',
      reason: 'forgot',
    });
    const second = await agent.put('/api/day-status').send({
      date: '2026-04-01',
      status: 'tracked',
      reason: 'fasted',
    });
    expect(second.status).toBe(200);
    expect(second.body.row.status).toBe('tracked');

    // Persisted exactly one row.
    const list = await agent.get('/api/day-status?from=2026-04-01&to=2026-04-01');
    expect(list.body.rows).toHaveLength(1);
    expect(list.body.rows[0].status).toBe('tracked');
  });

  it('DELETE removes the explicit row → reverts to auto-classification', async () => {
    const agent = await authedAgent();
    await agent.put('/api/day-status').send({
      date: '2026-05-15',
      status: 'untracked',
      reason: 'vacation',
    });
    const del = await agent.del('/api/day-status/2026-05-15');
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(1);

    const list = await agent.get('/api/day-status?from=2026-05-15&to=2026-05-15');
    expect(list.body.rows).toEqual([]);
  });

  it('isolates rows between users', async () => {
    const a = await authedAgent();
    const b = await authedAgent();
    await a.put('/api/day-status').send({ date: '2026-06-01', status: 'untracked', reason: 'vacation' });

    const aList = await a.get('/api/day-status?from=2026-06-01&to=2026-06-01');
    const bList = await b.get('/api/day-status?from=2026-06-01&to=2026-06-01');
    expect(aList.body.rows).toHaveLength(1);
    expect(bList.body.rows).toHaveLength(0);
  });

  it('range filter excludes rows outside [from, to]', async () => {
    const agent = await authedAgent();
    await agent.put('/api/day-status').send({ date: '2026-07-01', status: 'untracked', reason: 'forgot' });
    await agent.put('/api/day-status').send({ date: '2026-07-15', status: 'untracked', reason: 'vacation' });
    await agent.put('/api/day-status').send({ date: '2026-08-01', status: 'tracked', reason: 'fasted' });

    const res = await agent.get('/api/day-status?from=2026-07-10&to=2026-07-20');
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].date).toBe('2026-07-15');
  });

  it('persists row in DB so the cascade-delete hook can find it', async () => {
    const agent = await authedAgent();
    await agent.put('/api/day-status').send({ date: '2026-09-01', status: 'untracked', reason: 'illness' });
    const count = await DayStatus.countDocuments();
    expect(count).toBe(1);
  });
});
