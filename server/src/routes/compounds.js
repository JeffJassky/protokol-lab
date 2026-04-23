import { Router } from 'express';
import Compound from '../models/Compound.js';
import DoseLog from '../models/DoseLog.js';

const router = Router();

// System catalog. Seeded per-user on first list-read. New entries added here
// show up for existing users on next fetch (insertMany skips duplicates by
// the (userId, name) unique index).
const SYSTEM_COMPOUNDS = [
  { name: 'Retatrutide',  halfLifeDays: 6,   intervalDays: 7, doseUnit: 'mg', color: '#f59e0b', kineticsShape: 'subq',  enabledByDefault: true },
  { name: 'Tirzepatide',  halfLifeDays: 5,   intervalDays: 7, doseUnit: 'mg', color: '#10b981', kineticsShape: 'subq',  enabledByDefault: false },
  { name: 'Semaglutide',  halfLifeDays: 7,   intervalDays: 7, doseUnit: 'mg', color: '#3b82f6', kineticsShape: 'depot', enabledByDefault: false },
  { name: 'Cagrilintide', halfLifeDays: 7,   intervalDays: 7, doseUnit: 'mg', color: '#8b5cf6', kineticsShape: 'subq',  enabledByDefault: false },
  { name: 'BPC-157',      halfLifeDays: 0.25,intervalDays: 1, doseUnit: 'mcg',color: '#ec4899', kineticsShape: 'subq',  enabledByDefault: false },
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
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
}

router.get('/', async (req, res) => {
  await ensureDefaults(req.userId);
  const compounds = await Compound.find({ userId: req.userId }).sort({ order: 1, createdAt: 1 });
  res.json({ compounds });
});

router.post('/', async (req, res) => {
  const { name, halfLifeDays, intervalDays, doseUnit, color, kineticsShape } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  if (halfLifeDays == null || intervalDays == null) {
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
    res.status(201).json({ compound });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Compound with this name already exists' });
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const compound = await Compound.findOne({ _id: req.params.id, userId: req.userId });
  if (!compound) return res.status(404).json({ error: 'Not found' });

  const {
    name, enabled, halfLifeDays, intervalDays, doseUnit, color, kineticsShape,
    reminderEnabled, reminderTime,
  } = req.body;

  // System rows: locked name + doseUnit. Other fields user-tunable so research
  // updates to half-life or a schedule change don't require a code edit.
  if (compound.isSystem) {
    if (name !== undefined && name !== compound.name) {
      return res.status(400).json({ error: 'Cannot rename a system compound' });
    }
    if (doseUnit !== undefined && doseUnit !== compound.doseUnit) {
      return res.status(400).json({ error: 'Cannot change doseUnit on a system compound' });
    }
  } else if (name !== undefined) {
    compound.name = String(name).trim();
  }

  if (enabled !== undefined) compound.enabled = Boolean(enabled);
  if (halfLifeDays !== undefined) compound.halfLifeDays = Number(halfLifeDays);
  if (intervalDays !== undefined) compound.intervalDays = Number(intervalDays);
  if (!compound.isSystem && doseUnit !== undefined) compound.doseUnit = doseUnit;
  if (color !== undefined) compound.color = color;
  if (kineticsShape !== undefined && ['bolus', 'subq', 'depot'].includes(kineticsShape)) {
    compound.kineticsShape = kineticsShape;
  }
  if (reminderEnabled !== undefined) compound.reminderEnabled = Boolean(reminderEnabled);
  if (reminderTime !== undefined) {
    // Validate HH:mm so the scheduler doesn't have to defend against garbage.
    compound.reminderTime = /^\d{2}:\d{2}$/.test(reminderTime) ? reminderTime : '';
  }

  try {
    await compound.save();
    res.json({ compound });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Compound with this name already exists' });
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const compound = await Compound.findOne({ _id: req.params.id, userId: req.userId });
  if (!compound) return res.status(404).json({ error: 'Not found' });
  if (compound.isSystem) {
    return res.status(400).json({ error: 'System compounds cannot be deleted. Disable instead.' });
  }
  await DoseLog.deleteMany({ userId: req.userId, compoundId: compound._id });
  await compound.deleteOne();
  res.status(204).send();
});

export default router;
