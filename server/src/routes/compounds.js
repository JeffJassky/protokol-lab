import { Router } from 'express';
import Compound from '../models/Compound.js';
import DoseLog from '../models/DoseLog.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('compounds');
const router = Router();

// System compounds are limited to FDA-approved agents. Anything else the user
// wants to track is created as a custom (isSystem=false) compound via POST /.
const SYSTEM_COMPOUNDS = [
  { name: 'Tirzepatide', halfLifeDays: 5, intervalDays: 7, doseUnit: 'mg', color: '#10b981', kineticsShape: 'subq',  enabledByDefault: true  },
  { name: 'Semaglutide', halfLifeDays: 7, intervalDays: 7, doseUnit: 'mg', color: '#3b82f6', kineticsShape: 'depot', enabledByDefault: false },
];

async function ensureDefaults(userId) {
  const existing = await Compound.find({ userId, isSystem: true }).select('name').lean();
  const have = new Set(existing.map((c) => c.name));
  const missing = SYSTEM_COMPOUNDS.filter((c) => !have.has(c.name));
  if (!missing.length) return;
  const docs = missing.map((c, i) => ({
    userId,
    name: c.name,
    isSystem: true,
    enabled: c.enabledByDefault,
    halfLifeDays: c.halfLifeDays,
    intervalDays: c.intervalDays,
    doseUnit: c.doseUnit,
    color: c.color,
    kineticsShape: c.kineticsShape,
    order: i,
  }));
  try {
    await Compound.insertMany(docs, { ordered: false });
    log.info({ userId: String(userId), count: docs.length, names: missing.map((m) => m.name) }, 'compounds: seeded system');
  } catch (err) {
    if (err.code !== 11000) {
      log.error({ ...errContext(err), userId: String(userId) }, 'compounds: seed failed');
      throw err;
    }
    log.debug({ userId: String(userId) }, 'compounds: seed race (duplicate, ignored)');
  }
}

router.get('/', async (req, res) => {
  await ensureDefaults(req.userId);
  const compounds = await Compound.find({ userId: req.userId }).sort({ order: 1, createdAt: 1 });
  (req.log || log).debug({ count: compounds.length }, 'compounds: list');
  res.json({ compounds });
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const { name, halfLifeDays, intervalDays, doseUnit, color, kineticsShape } = req.body;
  if (!name || !name.trim()) {
    rlog.warn('compounds create: missing name');
    return res.status(400).json({ error: 'name required' });
  }
  if (halfLifeDays == null || intervalDays == null) {
    rlog.warn({ name }, 'compounds create: missing halfLifeDays/intervalDays');
    return res.status(400).json({ error: 'halfLifeDays and intervalDays required' });
  }

  const last = await Compound.findOne({ userId: req.userId }).sort({ order: -1 });
  const order = last ? last.order + 1 : 0;

  try {
    const compound = await Compound.create({
      userId: req.userId,
      name: name.trim(),
      isSystem: false,
      enabled: true,
      halfLifeDays: Number(halfLifeDays),
      intervalDays: Number(intervalDays),
      doseUnit: doseUnit || 'mg',
      color: color || '',
      kineticsShape: ['bolus', 'subq', 'depot'].includes(kineticsShape) ? kineticsShape : 'subq',
      order,
    });
    rlog.info(
      { compoundId: String(compound._id), name: compound.name, halfLifeDays, intervalDays, kineticsShape: compound.kineticsShape },
      'compounds: created',
    );
    res.status(201).json({ compound });
  } catch (err) {
    if (err.code === 11000) {
      rlog.warn({ name }, 'compounds create: duplicate name');
      return res.status(409).json({ error: 'Compound with this name already exists' });
    }
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const rlog = req.log || log;
  const compound = await Compound.findOne({ _id: req.params.id, userId: req.userId });
  if (!compound) {
    rlog.warn({ compoundId: req.params.id }, 'compounds patch: not found');
    return res.status(404).json({ error: 'Not found' });
  }

  const {
    name, enabled, halfLifeDays, intervalDays, doseUnit, color, kineticsShape,
    reminderEnabled, reminderTime,
  } = req.body;

  if (compound.isSystem) {
    if (name !== undefined && name !== compound.name) {
      rlog.warn({ compoundId: req.params.id }, 'compounds patch: cannot rename system compound');
      return res.status(400).json({ error: 'Cannot rename a system compound' });
    }
    if (doseUnit !== undefined && doseUnit !== compound.doseUnit) {
      rlog.warn({ compoundId: req.params.id }, 'compounds patch: cannot change system doseUnit');
      return res.status(400).json({ error: 'Cannot change doseUnit on a system compound' });
    }
  } else if (name !== undefined) {
    compound.name = String(name).trim();
  }

  const changed = [];
  if (enabled !== undefined && compound.enabled !== Boolean(enabled)) { compound.enabled = Boolean(enabled); changed.push('enabled'); }
  if (halfLifeDays !== undefined) { compound.halfLifeDays = Number(halfLifeDays); changed.push('halfLifeDays'); }
  if (intervalDays !== undefined) { compound.intervalDays = Number(intervalDays); changed.push('intervalDays'); }
  if (!compound.isSystem && doseUnit !== undefined) { compound.doseUnit = doseUnit; changed.push('doseUnit'); }
  if (color !== undefined) { compound.color = color; changed.push('color'); }
  if (kineticsShape !== undefined && ['bolus', 'subq', 'depot'].includes(kineticsShape)) {
    compound.kineticsShape = kineticsShape;
    changed.push('kineticsShape');
  }
  if (reminderEnabled !== undefined) { compound.reminderEnabled = Boolean(reminderEnabled); changed.push('reminderEnabled'); }
  if (reminderTime !== undefined) {
    compound.reminderTime = /^\d{2}:\d{2}$/.test(reminderTime) ? reminderTime : '';
    changed.push('reminderTime');
  }

  try {
    await compound.save();
    rlog.info({ compoundId: req.params.id, name: compound.name, changed }, 'compounds: patched');
    res.json({ compound });
  } catch (err) {
    if (err.code === 11000) {
      rlog.warn({ compoundId: req.params.id, name: compound.name }, 'compounds patch: duplicate name');
      return res.status(409).json({ error: 'Compound with this name already exists' });
    }
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const rlog = req.log || log;
  const compound = await Compound.findOne({ _id: req.params.id, userId: req.userId });
  if (!compound) {
    rlog.warn({ compoundId: req.params.id }, 'compounds delete: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  if (compound.isSystem) {
    rlog.warn({ compoundId: req.params.id, name: compound.name }, 'compounds delete: system compound blocked');
    return res.status(400).json({ error: 'System compounds cannot be deleted. Disable instead.' });
  }
  const { deletedCount } = await DoseLog.deleteMany({ userId: req.userId, compoundId: compound._id });
  await compound.deleteOne();
  rlog.info(
    { compoundId: req.params.id, name: compound.name, cascadedDoses: deletedCount },
    'compounds: deleted + cascaded dose logs',
  );
  res.status(204).send();
});

export default router;
