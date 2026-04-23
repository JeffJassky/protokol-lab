import { Router } from 'express';
import DoseLog from '../models/DoseLog.js';
import Compound from '../models/Compound.js';

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
  res.json({ entries });
});

// Absorption half-life (days) per kinetics shape. Bolus is special-cased.
const ABSORPTION_HALF_LIFE_DAYS = { subq: 0.25, depot: 1 };

// Active amount in central compartment at `daysSince` after a dose, given the
// compound's kinetics shape. Bolus = single-exp decay. Subq/depot = Bateman
// (absorption + elimination), normalized so total exposure equals D/ke.
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

// Compute PK curves — one per compound — as estimated active amount in system
// over time. Each compound uses its own half-life + kinetics shape.
router.get('/pk', async (req, res) => {
  const { from, to, points = 100 } = req.query;

  const compounds = await Compound.find({ userId: req.userId }).lean();
  const compoundById = new Map(compounds.map((c) => [String(c._id), c]));

  const allDoses = await DoseLog.find({ userId: req.userId }).sort({ date: 1 }).lean();
  if (!allDoses.length) return res.json({ curves: [] });

  // Global time window — shared x-axis across every compound's curve so the
  // chart can overlay them without interpolation.
  const startDate = from ? new Date(from) : allDoses[0].date;
  const endDate = to ? new Date(to) : new Date();
  const totalMs = endDate - startDate;
  const n = Number(points);
  const stepMs = totalMs / (n - 1);

  // Group doses by compoundId.
  const dosesByCompound = new Map();
  for (const d of allDoses) {
    const key = String(d.compoundId);
    if (!dosesByCompound.has(key)) dosesByCompound.set(key, []);
    dosesByCompound.get(key).push(d);
  }

  const curves = [];
  for (const [compoundId, doses] of dosesByCompound) {
    const compound = compoundById.get(compoundId);
    if (!compound) continue; // Orphaned logs (shouldn't happen). Skip.
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

  res.json({ curves });
});

router.post('/', async (req, res) => {
  const { compoundId, value, date } = req.body;
  if (!compoundId) return res.status(400).json({ error: 'compoundId required' });
  if (value == null) return res.status(400).json({ error: 'value required' });

  const compound = await Compound.findOne({ _id: compoundId, userId: req.userId });
  if (!compound) return res.status(400).json({ error: 'Invalid compoundId' });

  const entry = await DoseLog.create({
    userId: req.userId,
    compoundId,
    value: Number(value),
    date: new Date(date),
  });
  res.status(201).json({ entry });
});

router.delete('/:id', async (req, res) => {
  const entry = await DoseLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

export default router;
