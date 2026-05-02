import { Router } from 'express';
import WaterLog from '../models/WaterLog.js';
import { childLogger } from '../lib/logger.js';
import { parseLogDate, ymdDayBounds } from '../lib/date.js';

const log = childLogger('water');
const router = Router();

// List entries. With ?date=YYYY-MM-DD returns just that day; with ?from/?to
// returns the range (used by the dashboard chart).
router.get('/', async (req, res) => {
  const { date, from, to } = req.query;
  const filter = { userId: req.userId };
  if (date) {
    const { start, end } = ymdDayBounds(date);
    filter.date = { $gte: start, $lt: end };
  } else if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  const entries = await WaterLog.find(filter).sort({ date: -1, createdAt: -1 });
  (req.log || log).debug({ date, from, to, count: entries.length }, 'water: list');
  res.json({ entries });
});

// Daily-total aggregation for the dashboard. Mirrors foodlog daily-nutrition.
router.get('/daily-totals', async (req, res) => {
  const { from, to } = req.query;
  const match = { userId: req.userId };
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) match.date.$lte = new Date(to);
  }
  const rows = await WaterLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' },
        },
        volumeMl: { $sum: '$volumeMl' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  res.json({ days: rows.map((r) => ({ date: r._id, volumeMl: r.volumeMl })) });
});

router.post('/', async (req, res) => {
  const { volumeMl, date } = req.body;
  if (volumeMl == null || !date) {
    (req.log || log).warn({ volumeMl, date }, 'water create: missing fields');
    return res.status(400).json({ error: 'volumeMl and date required' });
  }
  const v = Number(volumeMl);
  if (!Number.isFinite(v) || v <= 0) {
    return res.status(400).json({ error: 'volumeMl must be positive number' });
  }
  const entry = await WaterLog.create({
    userId: req.userId,
    volumeMl: v,
    date: parseLogDate(date),
  });
  (req.log || log).info({ entryId: String(entry._id), volumeMl: v, date }, 'water: logged');
  res.status(201).json({ entry });
});

router.delete('/:id', async (req, res) => {
  const entry = await WaterLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) {
    (req.log || log).warn({ entryId: req.params.id }, 'water delete: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info({ entryId: req.params.id }, 'water: deleted');
  res.status(204).send();
});

export default router;
