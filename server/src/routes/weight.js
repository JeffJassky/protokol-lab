import { Router } from 'express';
import WeightLog from '../models/WeightLog.js';
import UserSettings from '../models/UserSettings.js';
import { childLogger } from '../lib/logger.js';
import { parseLogDate } from '../lib/date.js';

const log = childLogger('weight');
const router = Router();

router.get('/', async (req, res) => {
  const { from, to } = req.query;
  const filter = { userId: req.userId };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  const entries = await WeightLog.find(filter).sort({ date: -1 });
  (req.log || log).debug({ from, to, count: entries.length }, 'weight: list');
  res.json({ entries });
});

router.get('/stats', async (req, res) => {
  const entries = await WeightLog.find({ userId: req.userId }).sort({ date: 1 });
  const settings = await UserSettings.findOne({ userId: req.userId });

  if (!entries.length) {
    (req.log || log).debug('weight: stats requested, no entries');
    return res.json({ stats: null });
  }

  const first = entries[0];
  const latest = entries[entries.length - 1];
  const currentWeight = latest.weightLbs;
  const totalChange = currentWeight - first.weightLbs;

  const heightInches = settings?.heightInches || 70;
  const currentBMI = (currentWeight / (heightInches * heightInches)) * 703;

  const percentChange = (totalChange / first.weightLbs) * 100;

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const msPerDay = 24 * 60 * 60 * 1000;
  const weeks = (latest.date - first.date) / msPerWeek;
  const weeklyAvg = weeks > 0 ? totalChange / weeks : 0;

  let trendLbsPerWeek = 0;
  if (entries.length >= 2) {
    const xs = entries.map((e) => (e.date - first.date) / msPerDay);
    const ys = entries.map((e) => e.weightLbs);
    const n = entries.length;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      num += dx * (ys[i] - meanY);
      den += dx * dx;
    }
    if (den > 0) trendLbsPerWeek = (num / den) * 7;
  }

  const goalWeightLbs = settings?.goalWeightLbs || null;
  const toGoal = goalWeightLbs != null ? currentWeight - goalWeightLbs : null;

  (req.log || log).debug(
    { entryCount: entries.length, currentWeight, trendLbsPerWeek, toGoal },
    'weight: stats computed',
  );

  res.json({
    stats: {
      currentWeight,
      totalChange: Number(totalChange.toFixed(1)),
      currentBMI: Number(currentBMI.toFixed(1)),
      percentChange: Number(percentChange.toFixed(1)),
      weeklyAvg: Number(weeklyAvg.toFixed(2)),
      trendLbsPerWeek: Number(trendLbsPerWeek.toFixed(2)),
      toGoal: toGoal != null ? Number(toGoal.toFixed(1)) : null,
    },
  });
});

router.post('/', async (req, res) => {
  const { weightLbs, date } = req.body;
  const entry = await WeightLog.create({
    userId: req.userId,
    weightLbs,
    date: parseLogDate(date),
  });
  (req.log || log).info({ entryId: String(entry._id), weightLbs, date }, 'weight: logged');
  res.status(201).json({ entry });
});

router.delete('/:id', async (req, res) => {
  const entry = await WeightLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) {
    (req.log || log).warn({ entryId: req.params.id }, 'weight: delete target not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info({ entryId: req.params.id, weightLbs: entry.weightLbs }, 'weight: deleted');
  res.status(204).send();
});

export default router;
