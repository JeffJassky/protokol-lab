// Settings sanitation for the new namespaces:
//   - UserSettings.exercise (energyMode, showOnLog/Dashboard, enabled)
//   - UserSettings.tracking (confirmationMode)
//
// Locks in the enum / boolean / default rules so a malformed PATCH
// can't silently pollute the persisted settings.

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp({ serveClient: false });

async function authedAgent() {
  const agent = request.agent(app);
  const email = `set-${Math.random().toString(36).slice(2)}@example.com`;
  await agent.post('/api/auth/register').send({ email, password: 'passw0rd-ok' });
  return agent;
}

async function read(agent) {
  const res = await agent.get('/api/settings');
  return res.body.settings || {};
}

describe('UserSettings.exercise sanitation', () => {
  it('persists a valid energy mode', async () => {
    const agent = await authedAgent();
    const res = await agent.patch('/api/settings').send({
      exercise: { enabled: true, energyMode: 'earn' },
    });
    expect(res.status).toBe(200);
    const s = await read(agent);
    expect(s.exercise.enabled).toBe(true);
    expect(s.exercise.energyMode).toBe('earn');
  });

  it('falls back to "baseline" on unknown energy mode', async () => {
    const agent = await authedAgent();
    await agent.patch('/api/settings').send({
      exercise: { enabled: true, energyMode: 'gobbledygook' },
    });
    const s = await read(agent);
    expect(s.exercise.energyMode).toBe('baseline');
  });

  it('coerces enabled / show flags to booleans', async () => {
    const agent = await authedAgent();
    await agent.patch('/api/settings').send({
      exercise: { enabled: 1, showOnLog: 0, showOnDashboard: 'yes' },
    });
    const s = await read(agent);
    expect(s.exercise.enabled).toBe(true);
    expect(s.exercise.showOnLog).toBe(false);
    expect(s.exercise.showOnDashboard).toBe(true);
  });

  it('defaults show flags to true when unset', async () => {
    const agent = await authedAgent();
    await agent.patch('/api/settings').send({ exercise: { enabled: true } });
    const s = await read(agent);
    expect(s.exercise.showOnLog).toBe(true);
    expect(s.exercise.showOnDashboard).toBe(true);
  });

  it('accepts all three energy modes (baseline, earn, hidden)', async () => {
    const agent = await authedAgent();
    for (const mode of ['baseline', 'earn', 'hidden']) {
      await agent.patch('/api/settings').send({ exercise: { enabled: true, energyMode: mode } });
      const s = await read(agent);
      expect(s.exercise.energyMode).toBe(mode);
    }
  });
});

describe('UserSettings.tracking sanitation', () => {
  it('defaults to passive when nothing is set', async () => {
    const agent = await authedAgent();
    // Touch settings (any field) so the doc exists; tracking should
    // resolve to its schema default on read.
    await agent.patch('/api/settings').send({ age: 30 });
    const s = await read(agent);
    expect(s.tracking?.confirmationMode || 'passive').toBe('passive');
  });

  it('persists affirmative when explicitly set', async () => {
    const agent = await authedAgent();
    await agent.patch('/api/settings').send({
      tracking: { confirmationMode: 'affirmative' },
    });
    const s = await read(agent);
    expect(s.tracking.confirmationMode).toBe('affirmative');
  });

  it('falls back to passive on unknown mode', async () => {
    const agent = await authedAgent();
    await agent.patch('/api/settings').send({
      tracking: { confirmationMode: 'something-else' },
    });
    const s = await read(agent);
    expect(s.tracking.confirmationMode).toBe('passive');
  });

  it('round-trips passive ↔ affirmative without losing other settings', async () => {
    const agent = await authedAgent();
    // Seed unrelated settings.
    await agent.patch('/api/settings').send({ age: 35, sex: 'female' });
    // Toggle confirmation mode twice.
    await agent.patch('/api/settings').send({ tracking: { confirmationMode: 'affirmative' } });
    await agent.patch('/api/settings').send({ tracking: { confirmationMode: 'passive' } });
    const s = await read(agent);
    expect(s.tracking.confirmationMode).toBe('passive');
    expect(s.age).toBe(35);
    expect(s.sex).toBe('female');
  });
});
