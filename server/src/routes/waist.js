import { Router } from 'express';
import WaistLog from '../models/WaistLog.js';
import { childLogger } from '../lib/logger.js';
import { parseLogDate } from '../lib/date.js';

const log = childLogger('waist');
const router = Router();

router.get('/', async (req, res) => {
  const { from, to } = req.query;
  const filter = { userId: req.userId };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  const entries = await WaistLog.find(filter).sort({ date: -1 });
  (req.log || log).debug({ from, to, count: entries.length }, 'waist: list');
  res.json({ entries });
});

router.post('/', async (req, res) => {
  const { waistInches, date } = req.body;
  if (waistInches == null || !date) {
    (req.log || log).warn({ waistInches, date }, 'waist create: missing fields');
    return res.status(400).json({ error: 'waistInches and date required' });
  }
  const entry = await WaistLog.create({
    userId: req.userId,
    waistInches: Number(waistInches),
    date: parseLogDate(date),
  });
  (req.log || log).info({ entryId: String(entry._id), waistInches, date }, 'waist: logged');
  res.status(201).json({ entry });
});

router.delete('/:id', async (req, res) => {
  const entry = await WaistLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) {
    (req.log || log).warn({ entryId: req.params.id }, 'waist delete: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info({ entryId: req.params.id }, 'waist: deleted');
  res.status(204).send();
});

export default router;
