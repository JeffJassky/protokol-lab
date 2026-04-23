import { Router } from 'express';
import DayNote from '../models/DayNote.js';

const router = Router();

router.get('/range', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const rangeStart = new Date(from);
  const rangeEnd = new Date(to);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  const notes = await DayNote.find({
    userId: req.userId,
    date: { $gte: rangeStart, $lt: rangeEnd },
  }).sort({ date: 1 });
  res.json({
    notes: notes.map((n) => ({ date: n.date.toISOString().slice(0, 10), text: n.text })),
  });
});

router.get('/', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });
  const note = await DayNote.findOne({ userId: req.userId, date: new Date(date) });
  res.json({ note: note || null });
});

router.put('/', async (req, res) => {
  const { date, text } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  const day = new Date(date);
  const trimmed = typeof text === 'string' ? text : '';

  if (!trimmed.trim()) {
    await DayNote.findOneAndDelete({ userId: req.userId, date: day });
    return res.json({ note: null });
  }

  const note = await DayNote.findOneAndUpdate(
    { userId: req.userId, date: day },
    { text: trimmed, updatedAt: new Date() },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  res.json({ note });
});

export default router;
