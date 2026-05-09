// Coverage for the canonical-compound unification:
//   - GET /api/compounds returns canonical entries from core's
//     PEPTIDE_CATALOG merged with the user's per-row preferences,
//     plus their custom Compound rows.
//   - PATCH /api/compounds/core/:key persists per-user overrides
//     into UserSettings.compoundPreferences. doseUnit is intrinsic and
//     cannot be overridden.
//   - POST /api/compounds rejects names that shadow canonical entries
//     (label or brand alias).
//   - DoseLog accepts either compoundId or coreInterventionKey but
//     rejects rows that set both or neither.

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import DoseLog from '../src/models/DoseLog.js';
import UserSettings from '../src/models/UserSettings.js';
import User from '../src/models/User.js';
import { PLAN_IDS } from '../../shared/plans.js';

const app = createApp({ serveClient: false });

// Auth + premium plan so the custom-compound cap (free=0) doesn't
// block POST /api/compounds in tests that exercise the unified API.
async function authedAgent() {
  const agent = request.agent(app);
  const email = `cc-${Math.random().toString(36).slice(2)}@example.com`;
  const reg = await agent.post('/api/auth/register').send({ email, password: 'passw0rd-ok' });
  await User.findByIdAndUpdate(reg.body.user.id, { plan: PLAN_IDS.UNLIMITED });
  return agent;
}

describe('GET /api/compounds — unified list', () => {
  it('returns every canonical compound by default', async () => {
    const agent = await authedAgent();
    const res = await agent.get('/api/compounds');
    expect(res.status).toBe(200);
    const canonical = res.body.compounds.filter((c) => c.source === 'core');
    const keys = canonical.map((c) => c.coreInterventionKey).sort();
    // Every catalog entry should surface — six canonical GLP-1s today.
    expect(keys).toEqual(
      ['dulaglutide', 'liraglutide', 'retatrutide', 'semaglutide', 'semaglutide_oral', 'tirzepatide'],
    );
  });

  it('every canonical entry carries source=core, no _id, and intrinsic doseUnit', async () => {
    const agent = await authedAgent();
    const res = await agent.get('/api/compounds');
    const sema = res.body.compounds.find((c) => c.coreInterventionKey === 'semaglutide');
    expect(sema.source).toBe('core');
    expect(sema._id).toBeUndefined();
    expect(sema.doseUnit).toBe('mg');
    expect(sema.brandNames).toEqual(expect.arrayContaining(['Ozempic', 'Wegovy']));
    expect(sema.halfLifeDays).toBeGreaterThan(0);
  });

  it('custom compounds carry source=custom and an _id', async () => {
    const agent = await authedAgent();
    await agent.post('/api/compounds').send({
      name: 'My research peptide',
      halfLifeDays: 0.5,
      intervalDays: 1,
      doseUnit: 'mcg',
      kineticsShape: 'subq',
    });
    const res = await agent.get('/api/compounds');
    const custom = res.body.compounds.find((c) => c.name === 'My research peptide');
    expect(custom.source).toBe('custom');
    expect(custom._id).toBeTruthy();
    expect(custom.coreInterventionKey).toBeNull();
  });
});

describe('POST /api/compounds — canonical name protection', () => {
  it('rejects a custom compound named "Tirzepatide" (canonical label collision)', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/compounds').send({
      name: 'Tirzepatide',
      halfLifeDays: 5,
      intervalDays: 7,
    });
    expect(res.status).toBe(409);
  });

  it('rejects a custom compound named "Ozempic" (brand alias collision)', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/compounds').send({
      name: 'Ozempic',
      halfLifeDays: 7,
      intervalDays: 7,
    });
    expect(res.status).toBe(409);
  });

  it('accepts a non-colliding name', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/compounds').send({
      name: 'Some research compound',
      halfLifeDays: 1,
      intervalDays: 1,
    });
    expect(res.status).toBe(201);
  });
});

describe('PATCH /api/compounds/core/:key — preferences', () => {
  it('persists enabled toggle into UserSettings.compoundPreferences', async () => {
    const agent = await authedAgent();
    const res = await agent.patch('/api/compounds/core/tirzepatide').send({
      enabled: false,
      color: '#abcdef',
      intervalDays: 14,
      reminderEnabled: true,
      reminderTime: '08:30',
    });
    expect(res.status).toBe(200);
    expect(res.body.compound.enabled).toBe(false);
    expect(res.body.compound.color).toBe('#abcdef');
    expect(res.body.compound.intervalDays).toBe(14);
    expect(res.body.compound.reminderEnabled).toBe(true);
    expect(res.body.compound.reminderTime).toBe('08:30');

    // Persists onto UserSettings so a fresh GET reflects it.
    const list = await agent.get('/api/compounds');
    const tirz = list.body.compounds.find((c) => c.coreInterventionKey === 'tirzepatide');
    expect(tirz.enabled).toBe(false);
    expect(tirz.intervalDays).toBe(14);
  });

  it('rejects an unknown canonical key', async () => {
    const agent = await authedAgent();
    const res = await agent.patch('/api/compounds/core/unicornium').send({ enabled: false });
    expect(res.status).toBe(404);
  });

  it('clamps intervalDays into [0.5, 30]', async () => {
    const agent = await authedAgent();
    const res = await agent.patch('/api/compounds/core/semaglutide').send({ intervalDays: 999 });
    expect(res.status).toBe(200);
    expect(res.body.compound.intervalDays).toBe(30);
  });

  it('coerces invalid reminderTime to empty string', async () => {
    const agent = await authedAgent();
    const res = await agent.patch('/api/compounds/core/semaglutide').send({ reminderTime: 'not-a-time' });
    expect(res.body.compound.reminderTime).toBe('');
  });

  it('isolates preferences between users', async () => {
    const a = await authedAgent();
    const b = await authedAgent();
    await a.patch('/api/compounds/core/tirzepatide').send({ enabled: false });

    const aList = await a.get('/api/compounds');
    const bList = await b.get('/api/compounds');
    const aTirz = aList.body.compounds.find((c) => c.coreInterventionKey === 'tirzepatide');
    const bTirz = bList.body.compounds.find((c) => c.coreInterventionKey === 'tirzepatide');
    expect(aTirz.enabled).toBe(false);
    expect(bTirz.enabled).toBe(true);
  });
});

describe('DoseLog — polymorphic reference invariants', () => {
  it('accepts a dose with coreInterventionKey only', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/doses').send({
      coreInterventionKey: 'tirzepatide',
      value: 5,
      date: new Date('2026-04-01').toISOString(),
    });
    expect(res.status).toBe(201);
    expect(res.body.entry.coreInterventionKey).toBe('tirzepatide');
    expect(res.body.entry.compoundId).toBeNull();
  });

  it('accepts a dose with compoundId only (custom path)', async () => {
    const agent = await authedAgent();
    const create = await agent.post('/api/compounds').send({
      name: 'My peptide',
      halfLifeDays: 1,
      intervalDays: 1,
    });
    const res = await agent.post('/api/doses').send({
      compoundId: create.body.compound._id,
      value: 100,
      date: new Date('2026-04-02').toISOString(),
    });
    expect(res.status).toBe(201);
    expect(res.body.entry.coreInterventionKey).toBeNull();
  });

  it('rejects a dose with neither reference', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/doses').send({
      value: 5,
      date: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly one/i);
  });

  it('rejects a dose with both references', async () => {
    const agent = await authedAgent();
    const create = await agent.post('/api/compounds').send({
      name: 'My peptide 2',
      halfLifeDays: 1,
      intervalDays: 1,
    });
    const res = await agent.post('/api/doses').send({
      compoundId: create.body.compound._id,
      coreInterventionKey: 'semaglutide',
      value: 1,
      date: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly one/i);
  });

  it('rejects an unknown coreInterventionKey', async () => {
    const agent = await authedAgent();
    const res = await agent.post('/api/doses').send({
      coreInterventionKey: 'fictional-glp-1',
      value: 1,
      date: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown/i);
  });

  it('GET /api/doses?coreInterventionKey filter narrows to canonical doses', async () => {
    const agent = await authedAgent();
    await agent.post('/api/doses').send({
      coreInterventionKey: 'tirzepatide',
      value: 5, date: new Date('2026-05-01').toISOString(),
    });
    await agent.post('/api/doses').send({
      coreInterventionKey: 'semaglutide',
      value: 1, date: new Date('2026-05-02').toISOString(),
    });
    const res = await agent.get('/api/doses?coreInterventionKey=tirzepatide');
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].coreInterventionKey).toBe('tirzepatide');
  });
});

describe('GET /api/doses/pk — polymorphic curve grouping', () => {
  it('emits one curve per canonical key', async () => {
    const agent = await authedAgent();
    await agent.post('/api/doses').send({
      coreInterventionKey: 'tirzepatide',
      value: 5, date: new Date('2026-06-01').toISOString(),
    });
    await agent.post('/api/doses').send({
      coreInterventionKey: 'tirzepatide',
      value: 7.5, date: new Date('2026-06-08').toISOString(),
    });
    await agent.post('/api/doses').send({
      coreInterventionKey: 'semaglutide',
      value: 1, date: new Date('2026-06-01').toISOString(),
    });
    const res = await agent.get('/api/doses/pk');
    expect(res.status).toBe(200);
    const tirz = res.body.curves.find((c) => c.coreInterventionKey === 'tirzepatide');
    const sema = res.body.curves.find((c) => c.coreInterventionKey === 'semaglutide');
    expect(tirz).toBeTruthy();
    expect(sema).toBeTruthy();
    expect(tirz.source).toBe('core');
    expect(tirz.compoundId).toBeNull();
    expect(tirz.curve.length).toBeGreaterThan(0);
  });

  it('mixes canonical and custom curves in one response', async () => {
    const agent = await authedAgent();
    const create = await agent.post('/api/compounds').send({
      name: 'My custom', halfLifeDays: 2, intervalDays: 1,
    });
    await agent.post('/api/doses').send({
      compoundId: create.body.compound._id,
      value: 1, date: new Date('2026-07-01').toISOString(),
    });
    await agent.post('/api/doses').send({
      coreInterventionKey: 'liraglutide',
      value: 1.8, date: new Date('2026-07-01').toISOString(),
    });
    const res = await agent.get('/api/doses/pk');
    expect(res.body.curves).toHaveLength(2);
    const sources = res.body.curves.map((c) => c.source).sort();
    expect(sources).toEqual(['core', 'custom']);
  });
});

describe('Migration: system Compounds → preferences', () => {
  it('rewrites a legacy isSystem=true Compound + its DoseLogs', async () => {
    const agent = await authedAgent();

    // Simulate the pre-migration state: a system Compound row + a
    // DoseLog referencing it. Direct DB writes bypass the route's
    // canonical-name guard, mirroring how the seed used to insert these.
    const Compound = (await import('../src/models/Compound.js')).default;
    const meRes = await agent.get('/api/auth/me');
    const userId = meRes.body.user.id;

    const legacy = await Compound.create({
      userId, name: 'Tirzepatide', isSystem: true, enabled: true,
      halfLifeDays: 5, intervalDays: 7, doseUnit: 'mg', color: '#abcdef',
    });
    const legacyDose = await DoseLog.collection.insertOne({
      userId: legacy.userId, compoundId: legacy._id,
      coreInterventionKey: null,
      value: 5, date: new Date(), createdAt: new Date(),
    });

    const { runCanonicalCompoundMigration } = await import('../src/scripts/migrate-canonical-compounds.js');
    const stats = await runCanonicalCompoundMigration();
    expect(stats.matchedByName).toBe(1);
    expect(stats.compoundsDeleted).toBe(1);
    expect(stats.doseLogsRewritten).toBe(1);

    // Compound row gone.
    expect(await Compound.findById(legacy._id)).toBeNull();
    // DoseLog now points at the canonical key.
    const rewritten = await DoseLog.findById(legacyDose.insertedId);
    expect(rewritten.coreInterventionKey).toBe('tirzepatide');
    expect(rewritten.compoundId).toBeNull();
    // Preferences captured.
    const settings = await UserSettings.findOne({ userId });
    expect(settings.compoundPreferences.tirzepatide.color).toBe('#abcdef');
  });

  it('idempotent — re-running with no system rows is a no-op', async () => {
    await authedAgent();
    const { runCanonicalCompoundMigration } = await import('../src/scripts/migrate-canonical-compounds.js');
    const a = await runCanonicalCompoundMigration();
    const b = await runCanonicalCompoundMigration();
    expect(a.compoundsDeleted).toBe(0);
    expect(b.compoundsDeleted).toBe(0);
  });

  it('flips unmatched system compounds to custom rather than deleting', async () => {
    const agent = await authedAgent();
    const Compound = (await import('../src/models/Compound.js')).default;
    const me = await agent.get('/api/auth/me');
    const userId = me.body.user.id;

    // Synthetic isSystem=true row that doesn't match any catalog key.
    const stranger = await Compound.create({
      userId, name: 'Mystery Peptide', isSystem: true, enabled: true,
      halfLifeDays: 1, intervalDays: 1, doseUnit: 'mg',
    });

    const { runCanonicalCompoundMigration } = await import('../src/scripts/migrate-canonical-compounds.js');
    const stats = await runCanonicalCompoundMigration();
    expect(stats.unmatched).toBe(1);

    const after = await Compound.findById(stranger._id);
    expect(after).toBeTruthy();
    expect(after.isSystem).toBe(false);
  });
});
