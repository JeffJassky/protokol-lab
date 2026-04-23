import { Router } from 'express';
import WaistLog from '../models/WaistLog.js';

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
  res.json({ entries });
});

router.post('/', async (req, res) => {
  const { waistInches, date } = req.body;
  if (waistInches == null || !date) return res.status(400).json({ error: 'waistInches and date required' });
  const entry = await WaistLog.create({
    userId: req.userId,
    waistInches: Number(waistInches),
    date: new Date(date),
  });
  res.status(201).json({ entry });
});

router.delete('/:id', async (req, res) => {
  const entry = await WaistLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

export default router;
