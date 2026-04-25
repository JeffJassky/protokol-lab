import { Router } from 'express';
import Compound from '../models/Compound.js';
import DoseLog from '../models/DoseLog.js';
import { childLogger, errContext } from '../lib/logger.js';
import { evaluateStorageCap } from '../lib/planLimits.js';

const log = childLogger('compounds');
const router = Router();

// System compounds are limited to FDA-approved GLP-1 receptor agonists.
// Half-lives + intervals match the marketing /compounds reference page and
// the citations listed there. Anything outside this list is a custom
// (isSystem=false) compound created via POST /.
const SYSTEM_COMPOUNDS = [
  { name: 'Tirzepatide',        brandNames: ['Mounjaro', 'Zepbound'],   halfLifeDays: 5,    intervalDays: 7, doseUnit: 'mg', color: '#10b981', kineticsShape: 'subq',  enabledByDefault: true  },
  { name: 'Semaglutide',        brandNames: ['Ozempic', 'Wegovy'],      halfLifeDays: 7,    intervalDays: 7, doseUnit: 'mg', color: '#3b82f6', kineticsShape: 'depot', enabledByDefault: false },
  { name: 'Semaglutide (oral)', brandNames: ['Rybelsus'],               halfLifeDays: 7,    intervalDays: 1, doseUnit: 'mg', color: '#06b6d4', kineticsShape: 'subq',  enabledByDefault: false },
  { name: 'Liraglutide',        brandNames: ['Saxenda', 'Victoza'],     halfLifeDays: 0.54, intervalDays: 1, doseUnit: 'mg', color: '#f59e0b', kineticsShape: 'subq',  enabledByDefault: false },
  { name: 'Dulaglutide',        brandNames: ['Trulicity'],              halfLifeDays: 5,    intervalDays: 7, doseUnit: 'mg', color: '#8b5cf6', kineticsShape: 'depot', enabledByDefault: false },
];

async function ensureDefaults(userId) {
  const existing = await Compound.find({ userId, isSystem: true })
    .select('name brandNames')
    .lean();
  const have = new Map(existing.map((c) => [c.name, c]));
  const missing = SYSTEM_COMPOUNDS.filter((c) => !have.has(c.name));

  if (missing.length) {
    const docs = missing.map((c, i) => ({
      userId,
      name: c.name,
      brandNames: c.brandNames || [],
      isSystem: true,
      enabled: c.enabledByDefault,
      halfLifeDays: c.halfLifeDays,
      intervalDays: c.intervalDays,
      doseUnit: c.doseUnit,
      color: c.color,
      kineticsShape: c.kineticsShape,
      order: existing.length + i,
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

  // Back-fill brandNames on existing system docs that pre-date the field.
  // One-shot per user — once populated, the filter matches nothing.
  const stale = SYSTEM_COMPOUNDS.filter((c) => {
    const e = have.get(c.name);
    return e && (!Array.isArray(e.brandNames) || e.brandNames.length === 0) && (c.brandNames?.length);
  });
  if (stale.length) {
    await Promise.all(stale.map((c) =>
      Compound.updateOne(
        { userId, name: c.name, isSystem: true },
        { $set: { brandNames: c.brandNames } },
      ),
    ));
    log.info({ userId: String(userId), names: stale.map((s) => s.name) }, 'compounds: backfilled brandNames');
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
  const { name, brandNames, halfLifeDays, intervalDays, doseUnit, color, kineticsShape } = req.body;
  if (!name || !name.trim()) {
    rlog.warn('compounds create: missing name');
    return res.status(400).json({ error: 'name required' });
  }
  if (halfLifeDays == null || intervalDays == null) {
    rlog.warn({ name }, 'compounds create: missing halfLifeDays/intervalDays');
    return res.status(400).json({ error: 'halfLifeDays and intervalDays required' });
  }

  // Plan cap: only count user-created (custom) compounds. System compounds
  // are universal and never count toward the cap.
  const customCount = await Compound.countDocuments({
    userId: req.userId,
    isSystem: false,
  });
  const denial = evaluateStorageCap(req.user, 'customCompounds', customCount);
  if (denial) {
    rlog.warn(
      { userId: String(req.userId), used: denial.used, limit: denial.limit, plan: denial.currentPlan },
      'compounds create: plan cap reached',
    );
    return res.status(403).json({
      ...denial,
      message: denial.upgradePlanId
        ? `Your ${denial.currentPlan} plan allows ${denial.limit} custom compound${denial.limit === 1 ? '' : 's'}. Upgrade to add more.`
        : `You've reached the ${denial.limit}-compound limit for your plan.`,
    });
  }

  const last = await Compound.findOne({ userId: req.userId }).sort({ order: -1 });
  const order = last ? last.order + 1 : 0;

  try {
    const compound = await Compound.create({
      userId: req.userId,
      name: name.trim(),
      brandNames: Array.isArray(brandNames)
        ? brandNames.map((b) => String(b).trim()).filter(Boolean)
        : [],
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
    name, brandNames, enabled, halfLifeDays, intervalDays, doseUnit, color, kineticsShape,
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

  if (!compound.isSystem && brandNames !== undefined) {
    compound.brandNames = Array.isArray(brandNames)
      ? brandNames.map((b) => String(b).trim()).filter(Boolean)
      : [];
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
