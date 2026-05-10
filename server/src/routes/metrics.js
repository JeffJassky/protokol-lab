import { Router } from 'express';
import Metric from '../models/Metric.js';
import MetricLog from '../models/MetricLog.js';
import { childLogger, errContext } from '../lib/logger.js';
import { parseLogDate } from '../lib/date.js';
import { METRIC_PRESETS, CUSTOM_METRIC_DIMENSIONS } from '../../../shared/logging/metricPresets.js';
import { DIMENSIONS } from '../../../shared/units.js';

const log = childLogger('metrics');
const router = Router();

// Seed every preset for this user. Idempotent: an existing row keeps its
// `enabled`/`order` state, only newly-shipped presets get inserted. Race-safe
// via the (userId, key) unique index — duplicate-key errors are swallowed.
async function ensurePresets(userId) {
  const existing = await Metric.find({ userId, isPreset: true }).select('key').lean();
  const haveKeys = new Set(existing.map((m) => m.key));
  const missing = METRIC_PRESETS.filter((p) => !haveKeys.has(p.key));
  if (missing.length === 0) return;
  const docs = missing.map((p, i) => ({
    userId,
    key: p.key,
    name: p.name,
    category: p.category,
    dimension: p.dimension,
    isPreset: true,
    enabled: false, // seeded disabled — user opts in per metric
    order: existing.length + i,
  }));
  try {
    await Metric.insertMany(docs, { ordered: false });
    log.info({ userId: String(userId), count: docs.length }, 'metrics: seeded presets');
  } catch (err) {
    if (err.code !== 11000) {
      log.error({ ...errContext(err), userId: String(userId) }, 'metrics: seed failed');
      throw err;
    }
  }
}

router.get('/', async (req, res) => {
  await ensurePresets(req.userId);
  const metrics = await Metric.find({ userId: req.userId }).sort({ order: 1, createdAt: 1 });
  res.json({ metrics });
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const { name, dimension, displayUnit } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name required' });
  }
  if (!dimension || !CUSTOM_METRIC_DIMENSIONS.includes(dimension)) {
    return res.status(400).json({ error: `dimension must be one of: ${CUSTOM_METRIC_DIMENSIONS.join(', ')}` });
  }
  if (displayUnit && !DIMENSIONS[dimension].units.includes(displayUnit)) {
    return res.status(400).json({ error: `displayUnit not valid for dimension ${dimension}` });
  }

  const trimmed = name.trim();
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!slug) return res.status(400).json({ error: 'name must contain alphanumeric characters' });

  const last = await Metric.findOne({ userId: req.userId }).sort({ order: -1 });
  const order = last ? last.order + 1 : 0;

  try {
    const metric = await Metric.create({
      userId: req.userId,
      key: `custom_${slug}`,
      name: trimmed,
      category: 'custom',
      dimension,
      displayUnit: displayUnit || null,
      isPreset: false,
      enabled: true,
      order,
    });
    rlog.info({ metricId: String(metric._id), name: metric.name }, 'metrics: created');
    res.status(201).json({ metric });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Metric already exists' });
    }
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const metric = await Metric.findOne({ _id: req.params.id, userId: req.userId });
  if (!metric) return res.status(404).json({ error: 'Not found' });

  const { name, enabled, order, displayUnit } = req.body || {};

  // Presets get their identity fields locked — name + dimension are baked in
  // by the seed list. Users can still toggle enable/order/displayUnit.
  if (name !== undefined && !metric.isPreset) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
    metric.name = name.trim();
  }
  if (enabled !== undefined) metric.enabled = Boolean(enabled);
  if (order !== undefined) metric.order = Number(order);
  if (displayUnit !== undefined) {
    if (displayUnit === null || displayUnit === '') {
      metric.displayUnit = null;
    } else if (!DIMENSIONS[metric.dimension].units.includes(displayUnit)) {
      return res.status(400).json({ error: `displayUnit not valid for dimension ${metric.dimension}` });
    } else {
      metric.displayUnit = displayUnit;
    }
  }
  await metric.save();
  res.json({ metric });
});

router.delete('/:id', async (req, res) => {
  const metric = await Metric.findOne({ _id: req.params.id, userId: req.userId });
  if (!metric) return res.status(404).json({ error: 'Not found' });
  if (metric.isPreset) {
    return res.status(400).json({ error: 'Preset metrics cannot be deleted, only disabled' });
  }
  await metric.deleteOne();
  const { deletedCount } = await MetricLog.deleteMany({ userId: req.userId, metricId: metric._id });
  (req.log || log).info(
    { metricId: req.params.id, cascadedLogs: deletedCount },
    'metrics: deleted + cascaded logs',
  );
  res.status(204).send();
});

router.put('/reorder', async (req, res) => {
  // Bulk reorder. Body: { ids: [orderedIdArray] }. Per-metric `order` is
  // rewritten to its array index. All ids must belong to the user; an unknown
  // id rejects the whole batch.
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const found = await Metric.find({ userId: req.userId, _id: { $in: ids } }).select('_id');
  if (found.length !== ids.length) {
    return res.status(400).json({ error: 'unknown metric id in list' });
  }
  await Promise.all(
    ids.map((id, i) => Metric.updateOne({ _id: id, userId: req.userId }, { order: i })),
  );
  res.json({ updated: ids.length });
});

// ---- Logs ---------------------------------------------------------------

router.get('/logs', async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });
  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const logs = await MetricLog.find({
    userId: req.userId,
    date: { $gte: dayStart, $lt: dayEnd },
  });
  res.json({ logs });
});

router.get('/logs/range', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const rangeStart = new Date(from);
  const rangeEnd = new Date(to);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
  const logs = await MetricLog.find({
    userId: req.userId,
    date: { $gte: rangeStart, $lt: rangeEnd },
  }).sort({ date: 1 });
  res.json({
    logs: logs.map((l) => ({
      metricId: l.metricId,
      date: l.date.toISOString().slice(0, 10),
      value: l.value,
    })),
  });
});

router.put('/logs', async (req, res) => {
  const rlog = req.log || log;
  const { metricId, date, value } = req.body || {};
  if (!metricId || !date) {
    return res.status(400).json({ error: 'metricId and date required' });
  }
  const metric = await Metric.findOne({ _id: metricId, userId: req.userId });
  if (!metric) return res.status(404).json({ error: 'metric not found' });

  const day = parseLogDate(date);

  if (value == null || value === '') {
    const removed = await MetricLog.findOneAndDelete({
      userId: req.userId,
      metricId,
      date: day,
    });
    rlog.info({ metricId, date, existed: Boolean(removed) }, 'metrics: log cleared');
    return res.json({ removed: true });
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return res.status(400).json({ error: 'value must be a number' });
  }

  const entry = await MetricLog.findOneAndUpdate(
    { userId: req.userId, metricId, date: day },
    { value: num },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  rlog.info({ metricId, date, value: num }, 'metrics: log upserted');
  res.json({ log: entry });
});

export default router;
