import { Router } from 'express';
import DoseLog from '../models/DoseLog.js';
import Compound from '../models/Compound.js';
import { childLogger } from '../lib/logger.js';
import { parseLogDate } from '../lib/date.js';
import { PEPTIDE_CATALOG_INDEX } from '@kyneticbio/core';
import { maybeInvalidateAsync } from '../sim/invalidationHooks.js';
import { fire as fireMailerEvent } from '../services/mailery.js';

const log = childLogger('doses');
const router = Router();

const ABSORPTION_HALF_LIFE_DAYS = { subq: 0.25, depot: 1 };
const KINETICS_SHAPES = ['bolus', 'subq', 'depot'];

// Resolve PK params for a dose. Polymorphic by design — a dose either
// references a custom Compound row (existing path) or carries a
// canonical core key (new path post-migration). Returns null when the
// reference is dangling so callers can skip orphans cleanly.
function resolvePk(dose, customCompoundById) {
  if (dose.coreInterventionKey) {
    const entry = PEPTIDE_CATALOG_INDEX.get(dose.coreInterventionKey);
    if (!entry) return null;
    return {
      source: 'core',
      coreInterventionKey: dose.coreInterventionKey,
      name: entry.label,
      halfLifeDays: entry.defaultHalfLifeDays,
      kineticsShape: entry.defaultKineticsShape,
      doseUnit: entry.defaultDoseUnit,
    };
  }
  if (dose.compoundId) {
    const c = customCompoundById.get(String(dose.compoundId));
    if (!c) return null;
    return {
      source: 'custom',
      compoundId: String(c._id),
      name: c.name,
      halfLifeDays: c.halfLifeDays,
      kineticsShape: c.kineticsShape || 'subq',
      doseUnit: c.doseUnit || 'mg',
    };
  }
  return null;
}

// Bateman absorption + first-order elimination. Same math the dashboard
// has always used; covers the "active level" visualization without
// pulling in the full ODE simulation. Future: dashboard active-level
// chart can call into core's ODE engine for canonical compounds.
function activeAmount(dose, halfLifeDays, shape, daysSince) {
  if (daysSince < 0 || halfLifeDays <= 0) return 0;
  const ke = Math.LN2 / halfLifeDays;
  if (shape === 'bolus') return dose * Math.exp(-ke * daysSince);
  const absH = ABSORPTION_HALF_LIFE_DAYS[shape] ?? ABSORPTION_HALF_LIFE_DAYS.subq;
  const ka = Math.LN2 / absH;
  if (Math.abs(ka - ke) < 1e-6) {
    return dose * ke * daysSince * Math.exp(-ke * daysSince);
  }
  return dose * (ka / (ka - ke)) * (Math.exp(-ke * daysSince) - Math.exp(-ka * daysSince));
}

router.get('/', async (req, res) => {
  const { from, to, compoundId, coreInterventionKey } = req.query;
  const filter = { userId: req.userId };
  if (compoundId) filter.compoundId = compoundId;
  if (coreInterventionKey) filter.coreInterventionKey = coreInterventionKey;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  const entries = await DoseLog.find(filter).sort({ date: -1 });
  (req.log || log).debug(
    { from, to, compoundId, coreInterventionKey, count: entries.length },
    'doses: list',
  );
  res.json({ entries });
});

// PK active-level curves. Groups doses by their compound reference
// (either compoundId or coreInterventionKey) and emits one curve per
// group. Each curve carries enough metadata for the dashboard to
// render a labeled series without a separate compounds round-trip.
router.get('/pk', async (req, res) => {
  const rlog = req.log || log;
  const { from, to, points = 100 } = req.query;
  const t0 = Date.now();

  const customs = await Compound.find({ userId: req.userId }).lean();
  const customById = new Map(customs.map((c) => [String(c._id), c]));

  const allDoses = await DoseLog.find({ userId: req.userId }).sort({ date: 1 }).lean();
  if (!allDoses.length) {
    rlog.debug('pk: no doses — empty response');
    return res.json({ curves: [] });
  }

  const startDate = from ? new Date(from) : allDoses[0].date;
  const endDate = to ? new Date(to) : new Date();
  const totalMs = endDate - startDate;
  const n = Number(points);
  const stepMs = totalMs / (n - 1);

  // Group doses by reference key. Custom: 'custom:<id>'. Canonical:
  // 'core:<key>'. Single map so the rest of the loop is uniform.
  const groups = new Map();
  for (const d of allDoses) {
    const key = d.coreInterventionKey ? `core:${d.coreInterventionKey}` : `custom:${d.compoundId}`;
    if (!groups.has(key)) groups.set(key, { sample: d, doses: [] });
    groups.get(key).doses.push(d);
  }

  let orphaned = 0;
  const curves = [];
  for (const [, group] of groups) {
    const pk = resolvePk(group.sample, customById);
    if (!pk) { orphaned++; continue; }
    const shape = KINETICS_SHAPES.includes(pk.kineticsShape) ? pk.kineticsShape : 'subq';
    const curve = [];
    for (let i = 0; i < n; i++) {
      const t = new Date(startDate.getTime() + stepMs * i);
      let active = 0;
      for (const dose of group.doses) {
        const daysSince = (t - dose.date) / 86400000;
        active += activeAmount(dose.value, pk.halfLifeDays, shape, daysSince);
      }
      curve.push({ date: t.toISOString(), activeValue: Number(active.toFixed(4)) });
    }
    curves.push({
      // Identifier — the dashboard uses this to dedupe series across
      // re-fetches. Either the custom compound id or 'core:<key>'.
      compoundId: pk.source === 'custom' ? pk.compoundId : null,
      coreInterventionKey: pk.source === 'core' ? pk.coreInterventionKey : null,
      source: pk.source,
      name: pk.name,
      halfLifeDays: pk.halfLifeDays,
      kineticsShape: shape,
      doseUnit: pk.doseUnit,
      curve,
    });
  }

  if (orphaned > 0) {
    rlog.warn({ orphaned }, 'pk: orphaned dose groups (compound deleted or unknown core key?)');
  }
  rlog.debug(
    { groups: curves.length, totalDoses: allDoses.length, points: n, durationMs: Date.now() - t0 },
    'pk: curves computed',
  );
  res.json({ curves });
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const { compoundId, coreInterventionKey, value, date } = req.body;

  // Exactly one reference. Mirrors the model's pre('validate') guard,
  // but caught earlier so we return a clean 400 instead of a 500.
  const hasCustom = !!compoundId;
  const hasCanonical = typeof coreInterventionKey === 'string' && coreInterventionKey.length > 0;
  if (hasCustom === hasCanonical) {
    return res.status(400).json({
      error: 'Exactly one of compoundId or coreInterventionKey is required',
    });
  }
  if (value == null) {
    rlog.warn('doses create: missing value');
    return res.status(400).json({ error: 'value required' });
  }

  // Validate the reference resolves before writing.
  if (hasCustom) {
    const compound = await Compound.findOne({ _id: compoundId, userId: req.userId });
    if (!compound) {
      rlog.warn({ compoundId }, 'doses create: custom compound not owned');
      return res.status(400).json({ error: 'Invalid compoundId' });
    }
  } else {
    if (!PEPTIDE_CATALOG_INDEX.has(coreInterventionKey)) {
      return res.status(400).json({ error: 'Unknown coreInterventionKey' });
    }
  }

  // Snapshot the most recent prior log for the same compound — used to
  // detect a dose change (titration) below. Cheap indexed read.
  const priorQuery = hasCustom
    ? { userId: req.userId, compoundId }
    : { userId: req.userId, coreInterventionKey };
  const priorLog = await DoseLog.findOne(priorQuery).sort({ date: -1, _id: -1 }).lean();

  const numericValue = Number(value);
  const entry = await DoseLog.create({
    userId: req.userId,
    compoundId: hasCustom ? compoundId : null,
    coreInterventionKey: hasCanonical ? coreInterventionKey : null,
    value: numericValue,
    date: parseLogDate(date),
  });
  rlog.info(
    {
      entryId: String(entry._id),
      compoundId: hasCustom ? compoundId : null,
      coreInterventionKey: hasCanonical ? coreInterventionKey : null,
      value, date,
    },
    'doses: logged',
  );
  maybeInvalidateAsync(req.userId, entry.date, 'dose-create');

  // Email layer notifications. Both are best-effort and never block the
  // response. "Dose Logged" is once-per-contact (drives the first-dose
  // celebration); "Dose Changed" fires every time the user's most recent
  // dose for this compound differed from the new one — daily dedupe in
  // the Mailery registry prevents rapid-edit spam.
  fireMailerEvent('Dose Logged', req.userId, {
    compound: hasCustom ? String(compoundId) : coreInterventionKey,
    compoundKind: hasCustom ? 'custom' : 'core',
    value: numericValue,
  });
  if (priorLog && Number(priorLog.value) !== numericValue) {
    fireMailerEvent('Dose Changed', req.userId, {
      compound: hasCustom ? String(compoundId) : coreInterventionKey,
      compoundKind: hasCustom ? 'custom' : 'core',
      previousValue: Number(priorLog.value),
      newValue: numericValue,
      direction: numericValue > Number(priorLog.value) ? 'up' : 'down',
    });
  }

  res.status(201).json({ entry });
});

router.delete('/:id', async (req, res) => {
  const entry = await DoseLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) {
    (req.log || log).warn({ entryId: req.params.id }, 'doses delete: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  maybeInvalidateAsync(req.userId, entry.date, 'dose-delete');
  (req.log || log).info(
    {
      entryId: req.params.id,
      compoundId: entry.compoundId ? String(entry.compoundId) : null,
      coreInterventionKey: entry.coreInterventionKey || null,
    },
    'doses: deleted',
  );
  res.status(204).send();
});

export default router;
