import { Router } from 'express';
import DayNote from '../models/DayNote.js';
import { childLogger } from '../lib/logger.js';
import { parseLogDate } from '../lib/date.js';

const log = childLogger('notes');
const router = Router();

router.get('/range', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    (req.log || log).warn({ from, to }, 'notes range: missing from/to');
    return res.status(400).json({ error: 'from and to required' });
  }
  const rangeStart = new Date(from);
  const rangeEnd = new Date(to);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  const notes = await DayNote.find({
    userId: req.userId,
    date: { $gte: rangeStart, $lt: rangeEnd },
  }).sort({ date: 1 });
  (req.log || log).debug({ from, to, count: notes.length }, 'notes: range fetched');
  res.json({
    notes: notes.map((n) => ({ date: n.date.toISOString().slice(0, 10), text: n.text })),
  });
});

router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    (req.log || log).warn('notes get: missing date');
    return res.status(400).json({ error: 'date required' });
  }
  const note = await DayNote.findOne({ userId: req.userId, date: parseLogDate(date) });
  (req.log || log).debug({ date, exists: Boolean(note) }, 'notes: day fetched');
  res.json({ note: note || null });
});

router.put('/', async (req, res) => {
  const rlog = req.log || log;
  const { date, text } = req.body;
  if (!date) {
    rlog.warn('notes put: missing date');
    return res.status(400).json({ error: 'date required' });
  }
  const day = parseLogDate(date);
  const trimmed = typeof text === 'string' ? text : '';

  if (!trimmed.trim()) {
    const removed = await DayNote.findOneAndDelete({ userId: req.userId, date: day });
    rlog.info({ date, existed: Boolean(removed) }, 'notes: cleared');
    return res.json({ note: null });
  }

  const note = await DayNote.findOneAndUpdate(
    { userId: req.userId, date: day },
    { text: trimmed, updatedAt: new Date() },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  rlog.info({ date, textLength: trimmed.length }, 'notes: upserted');
  res.json({ note });
});

export default router;
