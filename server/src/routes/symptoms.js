import { Router } from 'express';
import Symptom from '../models/Symptom.js';
import SymptomLog from '../models/SymptomLog.js';

const router = Router();

// Defaults seeded the first time a user requests their symptom list. Order
// is preserved so the UI shows them in this sequence.
const DEFAULT_SYMPTOMS = [
  'Nausea',
  'Reflux / heartburn / acid burps',
  'Sulfur burps',
  'Gas / bloating',
  'Constipation',
  'Diarrhea',
  'Low energy',
];

async function ensureDefaults(userId) {
  const count = await Symptom.countDocuments({ userId });
  if (count > 0) return;
  const docs = DEFAULT_SYMPTOMS.map((name, i) => ({
    userId,
    name,
    isDefault: true,
    order: i,
  }));
  try {
    await Symptom.insertMany(docs, { ordered: false });
  } catch (err) {
    // Ignore duplicate-key races if two requests seed simultaneously.
    if (err.code !== 11000) throw err;
  }
}

// ---- Symptom types ------------------------------------------------------

router.get('/', async (req, res) => {
  await ensureDefaults(req.userId);
  const symptoms = await Symptom.find({ userId: req.userId }).sort({ order: 1, createdAt: 1 });
  res.json({ symptoms });
});

router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

  // Pick an order value at the end of the existing list.
  const last = await Symptom.findOne({ userId: req.userId }).sort({ order: -1 });
  const order = last ? last.order + 1 : 0;

  try {
    const symptom = await Symptom.create({
      userId: req.userId,
      name: name.trim(),
      isDefault: false,
      order,
    });
    res.status(201).json({ symptom });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Symptom already exists' });
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const symptom = await Symptom.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!symptom) return res.status(404).json({ error: 'Not found' });
  // Cascade: drop all logs for this symptom.
  await SymptomLog.deleteMany({ userId: req.userId, symptomId: symptom._id });
  res.status(204).send();
});

// ---- Symptom logs -------------------------------------------------------

// Get the set of dates that have at least one symptom log entry.
router.get('/logged-dates', async (req, res) => {
  const { from, to } = req.query;
  const match = { userId: req.userId };
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setUTCDate(end.getUTCDate() + 1);
      match.date.$lt = end;
    }
  }
  const results = await SymptomLog.aggregate([
    { $match: match },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } } },
    { $sort: { _id: 1 } },
  ]);
  res.json({ dates: results.map((r) => r._id) });
});

// All symptom logs across a date range. Returns an array of
// { symptomId, date (YYYY-MM-DD), severity } sorted by date.
router.get('/logs/range', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });

  const rangeStart = new Date(from);
  const rangeEnd = new Date(to);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const logs = await SymptomLog.find({
    userId: req.userId,
    date: { $gte: rangeStart, $lt: rangeEnd },
  }).sort({ date: 1 });

  const results = logs.map((l) => ({
    symptomId: l.symptomId,
    date: l.date.toISOString().slice(0, 10),
    severity: l.severity,
  }));

  res.json({ logs: results });
});

// All logs for a single date.
router.get('/logs', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });

  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const logs = await SymptomLog.find({
    userId: req.userId,
    date: { $gte: dayStart, $lt: dayEnd },
  });
  res.json({ logs });
});

// Upsert a severity for (symptom, date). Body: { symptomId, date, severity }.
// If severity is null, the log is removed instead.
router.put('/logs', async (req, res) => {
  const { symptomId, date, severity } = req.body;
  if (!symptomId || !date) return res.status(400).json({ error: 'symptomId and date required' });

  const day = new Date(date);

  if (severity == null) {
    await SymptomLog.findOneAndDelete({
      userId: req.userId,
      symptomId,
      date: day,
    });
    return res.json({ removed: true });
  }

  const sev = Number(severity);
  if (!Number.isInteger(sev) || sev < 0 || sev > 10) {
    return res.status(400).json({ error: 'severity must be 0-10' });
  }

  const log = await SymptomLog.findOneAndUpdate(
    { userId: req.userId, symptomId, date: day },
    { severity: sev },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  res.json({ log });
});

export default router;
