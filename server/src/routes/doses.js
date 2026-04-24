import { Router } from 'express';
import DoseLog from '../models/DoseLog.js';
import Compound from '../models/Compound.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('doses');
const router = Router();

router.get('/', async (req, res) => {
  const { from, to, compoundId } = req.query;
  const filter = { userId: req.userId };
  if (compoundId) filter.compoundId = compoundId;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  const entries = await DoseLog.find(filter).sort({ date: -1 });
  (req.log || log).debug({ from, to, compoundId, count: entries.length }, 'doses: list');
  res.json({ entries });
});

const ABSORPTION_HALF_LIFE_DAYS = { subq: 0.25, depot: 1 };

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

router.get('/pk', async (req, res) => {
  const rlog = req.log || log;
  const { from, to, points = 100 } = req.query;
  const t0 = Date.now();

  const compounds = await Compound.find({ userId: req.userId }).lean();
  const compoundById = new Map(compounds.map((c) => [String(c._id), c]));

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

  const dosesByCompound = new Map();
  for (const d of allDoses) {
    const key = String(d.compoundId);
    if (!dosesByCompound.has(key)) dosesByCompound.set(key, []);
    dosesByCompound.get(key).push(d);
  }

  let orphaned = 0;
  const curves = [];
  for (const [compoundId, doses] of dosesByCompound) {
    const compound = compoundById.get(compoundId);
    if (!compound) { orphaned++; continue; }
    const shape = compound.kineticsShape || 'subq';
    const curve = [];
    for (let i = 0; i < n; i++) {
      const t = new Date(startDate.getTime() + stepMs * i);
      let active = 0;
      for (const dose of doses) {
        const daysSince = (t - dose.date) / 86400000;
        active += activeAmount(dose.value, compound.halfLifeDays, shape, daysSince);
      }
      curve.push({ date: t.toISOString(), activeValue: Number(active.toFixed(4)) });
    }
    curves.push({
      compoundId,
      halfLifeDays: compound.halfLifeDays,
      kineticsShape: shape,
      doseUnit: compound.doseUnit,
      curve,
    });
  }

  if (orphaned > 0) {
    rlog.warn({ orphaned }, 'pk: orphaned doses (compound deleted?)');
  }
  rlog.debug(
    { compounds: curves.length, totalDoses: allDoses.length, points: n, durationMs: Date.now() - t0 },
    'pk: curves computed',
  );
  res.json({ curves });
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const { compoundId, value, date } = req.body;
  if (!compoundId) {
    rlog.warn('doses create: missing compoundId');
    return res.status(400).json({ error: 'compoundId required' });
  }
  if (value == null) {
    rlog.warn({ compoundId }, 'doses create: missing value');
    return res.status(400).json({ error: 'value required' });
  }

  const compound = await Compound.findOne({ _id: compoundId, userId: req.userId });
  if (!compound) {
    rlog.warn({ compoundId }, 'doses create: compound not owned');
    return res.status(400).json({ error: 'Invalid compoundId' });
  }

  const entry = await DoseLog.create({
    userId: req.userId,
    compoundId,
    value: Number(value),
    date: new Date(date),
  });
  rlog.info(
    { entryId: String(entry._id), compoundId, compoundName: compound.name, value, date },
    'doses: logged',
  );
  res.status(201).json({ entry });
});

router.delete('/:id', async (req, res) => {
  const entry = await DoseLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) {
    (req.log || log).warn({ entryId: req.params.id }, 'doses delete: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info({ entryId: req.params.id, compoundId: String(entry.compoundId) }, 'doses: deleted');
  res.status(204).send();
});

export default router;
