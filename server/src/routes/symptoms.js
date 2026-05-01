import { Router } from 'express';
import Symptom from '../models/Symptom.js';
import SymptomLog from '../models/SymptomLog.js';
import { childLogger, errContext } from '../lib/logger.js';
import { getEffectivePlanFeatures } from '../lib/planLimits.js';
import { parseLogDate } from '../lib/date.js';

const log = childLogger('symptoms');
const router = Router();

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
    userId, name, isDefault: true, order: i,
  }));
  try {
    await Symptom.insertMany(docs, { ordered: false });
    log.info({ userId: String(userId), count: docs.length }, 'symptoms: seeded defaults');
  } catch (err) {
    if (err.code !== 11000) {
      log.error({ ...errContext(err), userId: String(userId) }, 'symptoms: seed failed');
      throw err;
    }
    log.debug({ userId: String(userId) }, 'symptoms: seed race (duplicate key, ignored)');
  }
}

router.get('/', async (req, res) => {
  await ensureDefaults(req.userId);
  const symptoms = await Symptom.find({ userId: req.userId }).sort({ order: 1, createdAt: 1 });
  (req.log || log).debug({ count: symptoms.length }, 'symptoms: list');
  res.json({ symptoms });
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const { name } = req.body;
  if (!name || !name.trim()) {
    rlog.warn('symptoms create: missing name');
    return res.status(400).json({ error: 'name required' });
  }

  const last = await Symptom.findOne({ userId: req.userId }).sort({ order: -1 });
  const order = last ? last.order + 1 : 0;

  try {
    const symptom = await Symptom.create({
      userId: req.userId,
      name: name.trim(),
      isDefault: false,
      order,
    });
    rlog.info({ symptomId: String(symptom._id), name: symptom.name }, 'symptoms: created');
    res.status(201).json({ symptom });
  } catch (err) {
    if (err.code === 11000) {
      rlog.warn({ name }, 'symptoms create: duplicate name');
      return res.status(409).json({ error: 'Symptom already exists' });
    }
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const symptom = await Symptom.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!symptom) {
    (req.log || log).warn({ symptomId: req.params.id }, 'symptoms delete: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  const { deletedCount } = await SymptomLog.deleteMany({ userId: req.userId, symptomId: symptom._id });
  (req.log || log).info(
    { symptomId: req.params.id, cascadedLogs: deletedCount },
    'symptoms: deleted + cascaded logs',
  );
  res.status(204).send();
});

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
  (req.log || log).debug({ from, to, count: results.length }, 'symptoms: logged-dates');
  res.json({ dates: results.map((r) => r._id) });
});

router.get('/logs/range', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    (req.log || log).warn({ from, to }, 'symptom logs range: missing from/to');
    return res.status(400).json({ error: 'from and to required' });
  }

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
  (req.log || log).debug({ from, to, count: results.length }, 'symptoms: logs range');
  res.json({ logs: results });
});

router.get('/logs', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    (req.log || log).warn('symptom logs: missing date');
    return res.status(400).json({ error: 'date required' });
  }

  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const logs = await SymptomLog.find({
    userId: req.userId,
    date: { $gte: dayStart, $lt: dayEnd },
  });
  (req.log || log).debug({ date, count: logs.length }, 'symptoms: day logs');
  res.json({ logs });
});

router.put('/logs', async (req, res) => {
  const rlog = req.log || log;
  const { symptomId, date, severity } = req.body;
  if (!symptomId || !date) {
    rlog.warn({ symptomId, date }, 'symptom log upsert: missing fields');
    return res.status(400).json({ error: 'symptomId and date required' });
  }

  const day = parseLogDate(date);

  if (severity == null) {
    const removed = await SymptomLog.findOneAndDelete({
      userId: req.userId,
      symptomId,
      date: day,
    });
    rlog.info({ symptomId, date, existed: Boolean(removed) }, 'symptoms: log cleared');
    return res.json({ removed: true });
  }

  let sev = Number(severity);
  if (!Number.isInteger(sev) || sev < 0 || sev > 10) {
    rlog.warn({ symptomId, severity }, 'symptom log upsert: severity out of range');
    return res.status(400).json({ error: 'severity must be 0-10' });
  }

  // Plan gate: free tier only stores binary present/absent. Anything > 0
  // collapses to 1 so paid-only granularity can't sneak through the API.
  const features = getEffectivePlanFeatures(req.user);
  if (!features.advancedSymptomAnalytics && sev > 1) sev = 1;

  const entry = await SymptomLog.findOneAndUpdate(
    { userId: req.userId, symptomId, date: day },
    { severity: sev },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  rlog.info({ symptomId, date, severity: sev }, 'symptoms: log upserted');
  res.json({ log: entry });
});

export default router;
