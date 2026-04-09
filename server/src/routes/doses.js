import { Router } from 'express';
import DoseLog from '../models/DoseLog.js';

const router = Router();

const HALF_LIFE_DAYS = 6; // retatrutide ~6 day half-life
const DECAY_CONSTANT = Math.LN2 / HALF_LIFE_DAYS;

router.get('/', async (req, res) => {
  const { from, to } = req.query;
  const filter = { userId: req.userId };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  const entries = await DoseLog.find(filter).sort({ date: -1 });
  res.json({ entries });
});

// Compute PK curve: estimated active mg in system over time
router.get('/pk', async (req, res) => {
  const { from, to, points = 100 } = req.query;

  // Get all doses (need all historical doses for accurate summation)
  const allDoses = await DoseLog.find({ userId: req.userId }).sort({ date: 1 });
  if (!allDoses.length) return res.json({ curve: [] });

  const startDate = from ? new Date(from) : allDoses[0].date;
  const endDate = to ? new Date(to) : new Date();
  const totalMs = endDate - startDate;
  const stepMs = totalMs / (Number(points) - 1);

  const curve = [];
  for (let i = 0; i < Number(points); i++) {
    const t = new Date(startDate.getTime() + stepMs * i);
    let active = 0;
    for (const dose of allDoses) {
      const daysSince = (t - dose.date) / (24 * 60 * 60 * 1000);
      if (daysSince >= 0) {
        active += dose.doseMg * Math.exp(-DECAY_CONSTANT * daysSince);
      }
    }
    curve.push({ date: t.toISOString(), activeMg: Number(active.toFixed(3)) });
  }

  res.json({ curve, halfLifeDays: HALF_LIFE_DAYS });
});

router.post('/', async (req, res) => {
  const { doseMg, date, compound } = req.body;
  const entry = await DoseLog.create({
    userId: req.userId,
    doseMg,
    date: new Date(date),
    compound: compound || 'retatrutide',
  });
  res.status(201).json({ entry });
});

router.delete('/:id', async (req, res) => {
  const entry = await DoseLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

export default router;
