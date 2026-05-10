import { Router } from 'express';
import Compound from '../models/Compound.js';
import DoseLog from '../models/DoseLog.js';
import UserSettings from '../models/UserSettings.js';
import { childLogger, errContext } from '../lib/logger.js';
import { evaluateStorageCap } from '../lib/planLimits.js';
import { PEPTIDE_CATALOG, PEPTIDE_CATALOG_INDEX } from '@kyneticbio/core';
import { invalidateAsync } from '../sim/invalidationHooks.js';
import { runCanonicalCompoundMigration } from '../scripts/migrate-canonical-compounds.js';

// PK-affecting fields on a custom compound. Editing these retroactively
// changes how every dose of this compound is simulated → cache nuke.
// Cosmetic fields (color, reminderTime, brandNames) don't affect sim.
const PK_AFFECTING_FIELDS = new Set([
  'halfLifeDays', 'kineticsShape', 'doseUnit',
]);

const log = childLogger('compounds');
const router = Router();

const KINETICS_SHAPES = ['bolus', 'subq', 'depot'];
const HM_RE = /^\d{2}:\d{2}$/;

// Compose a single canonical-compound entry by merging the catalog row
// with the user's per-compound preferences (color override, custom
// interval, reminder setup, enabled/disabled, ordering). The result has
// the same shape consumers used to expect from a Compound row, plus a
// `source: 'core'` discriminator and a stable `coreInterventionKey`.
function composeCanonical(entry, prefs = {}) {
  return {
    source: 'core',
    coreInterventionKey: entry.key,
    name: entry.label,
    brandNames: entry.brandNames || [],
    isSystem: true, // legacy field — kept for client compatibility, do not mutate
    enabled: prefs.enabled !== false, // default true unless explicitly disabled
    halfLifeDays: entry.defaultHalfLifeDays,
    intervalDays: prefs.intervalDays != null ? prefs.intervalDays : entry.defaultIntervalDays,
    doseUnit: entry.defaultDoseUnit, // intrinsic, not user-customizable
    color: prefs.color || entry.defaultColor,
    kineticsShape: entry.defaultKineticsShape,
    order: prefs.order != null ? prefs.order : 1000,
    reminderEnabled: !!prefs.reminderEnabled,
    reminderTime: prefs.reminderTime || '',
    reference: entry.reference || null,
  };
}

// Decorate a custom Compound document with the source discriminator so
// the unified GET response is uniformly shaped. Kept lightweight —
// custom rows already have the right field names.
function shapeCustom(compound) {
  const c = compound.toObject ? compound.toObject() : compound;
  return {
    ...c,
    source: 'custom',
    coreInterventionKey: null,
  };
}

// Unified list. Returns every canonical compound (merged with the
// user's prefs) followed by every custom compound. Sorted by `order`,
// ties broken by name. Clients render this as a single picker — the
// `source` field disambiguates writes.
router.get('/', async (req, res) => {
  const rlog = req.log || log;
  // Lazy per-user migration: any legacy isSystem rows or custom rows
  // whose name matches a canonical catalog entry get folded into
  // canonical preferences before the merge. Idempotent + scoped to
  // this user, so first request after the canonical-compound rollout
  // self-heals without requiring an out-of-band CLI run.
  try {
    await runCanonicalCompoundMigration({ userId: req.userId });
  } catch (err) {
    rlog.warn(errContext(err), 'compounds: lazy migration failed (continuing)');
  }

  const [customs, settings] = await Promise.all([
    Compound.find({ userId: req.userId }).sort({ order: 1, createdAt: 1 }),
    UserSettings.findOne({ userId: req.userId }).select('compoundPreferences').lean(),
  ]);
  const prefs = (settings && settings.compoundPreferences) || {};

  const canonical = PEPTIDE_CATALOG.map((entry) => composeCanonical(entry, prefs[entry.key] || {}));
  const customsShaped = customs.map(shapeCustom);

  const merged = [...canonical, ...customsShaped].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });

  rlog.debug({ canonical: canonical.length, custom: customsShaped.length }, 'compounds: list');
  res.json({ compounds: merged });
});

// Update a per-user preference for a canonical compound. Body fields:
// `enabled`, `color`, `intervalDays`, `reminderEnabled`, `reminderTime`,
// `order`. doseUnit deliberately not customizable.
router.patch('/core/:key', async (req, res) => {
  const rlog = req.log || log;
  const { key } = req.params;
  if (!PEPTIDE_CATALOG_INDEX.has(key)) {
    return res.status(404).json({ error: 'Unknown canonical compound' });
  }
  const updates = {};
  const { enabled, color, intervalDays, reminderEnabled, reminderTime, order } = req.body || {};
  if (enabled !== undefined) updates.enabled = Boolean(enabled);
  if (color !== undefined && typeof color === 'string') updates.color = color.slice(0, 16);
  if (intervalDays !== undefined && Number.isFinite(Number(intervalDays))) {
    updates.intervalDays = Math.max(0.5, Math.min(30, Number(intervalDays)));
  }
  if (reminderEnabled !== undefined) updates.reminderEnabled = Boolean(reminderEnabled);
  if (reminderTime !== undefined) {
    updates.reminderTime = typeof reminderTime === 'string' && HM_RE.test(reminderTime)
      ? reminderTime
      : '';
  }
  if (order !== undefined && Number.isFinite(Number(order))) {
    updates.order = Math.round(Number(order));
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const setObj = Object.fromEntries(
    Object.entries(updates).map(([k, v]) => [`compoundPreferences.${key}.${k}`, v]),
  );
  await UserSettings.updateOne(
    { userId: req.userId },
    { $set: setObj, $setOnInsert: { userId: req.userId } },
    { upsert: true },
  );
  rlog.info({ key, fields: Object.keys(updates) }, 'compounds: canonical pref updated');

  // Re-shape the affected entry so the client gets the post-update view
  // without a second GET round-trip.
  const settings = await UserSettings.findOne({ userId: req.userId }).select('compoundPreferences').lean();
  const entry = PEPTIDE_CATALOG_INDEX.get(key);
  const compound = composeCanonical(entry, settings?.compoundPreferences?.[key] || {});
  res.json({ compound });
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

  // Names that collide with a canonical compound get rejected — those
  // are already represented via the catalog and shouldn't shadow.
  const lower = name.trim().toLowerCase();
  for (const entry of PEPTIDE_CATALOG) {
    if (entry.label.toLowerCase() === lower) {
      return res.status(409).json({ error: 'A canonical compound with this name already exists' });
    }
    if ((entry.brandNames || []).some((b) => b.toLowerCase() === lower)) {
      return res.status(409).json({ error: 'This is a brand name of a canonical compound' });
    }
  }

  // Plan cap: count existing custom rows. Canonical compounds don't
  // count toward the cap.
  const customCount = await Compound.countDocuments({ userId: req.userId });
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
      kineticsShape: KINETICS_SHAPES.includes(kineticsShape) ? kineticsShape : 'subq',
      order,
    });
    rlog.info(
      { compoundId: String(compound._id), name: compound.name, halfLifeDays, intervalDays, kineticsShape: compound.kineticsShape },
      'compounds: created',
    );
    res.status(201).json({ compound: shapeCustom(compound) });
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
  // Defensive: any stray isSystem=true row that escaped the migration
  // is read-only via this endpoint. Use /core/:key for canonical edits.
  if (compound.isSystem) {
    return res.status(400).json({ error: 'System compounds are managed via PATCH /api/compounds/core/:key' });
  }

  const {
    name, brandNames, enabled, halfLifeDays, intervalDays, doseUnit, color, kineticsShape,
    reminderEnabled, reminderTime,
  } = req.body;

  if (name !== undefined) compound.name = String(name).trim();
  if (brandNames !== undefined) {
    compound.brandNames = Array.isArray(brandNames)
      ? brandNames.map((b) => String(b).trim()).filter(Boolean)
      : [];
  }

  const changed = [];
  if (enabled !== undefined && compound.enabled !== Boolean(enabled)) { compound.enabled = Boolean(enabled); changed.push('enabled'); }
  if (halfLifeDays !== undefined) { compound.halfLifeDays = Number(halfLifeDays); changed.push('halfLifeDays'); }
  if (intervalDays !== undefined) { compound.intervalDays = Number(intervalDays); changed.push('intervalDays'); }
  if (doseUnit !== undefined) { compound.doseUnit = doseUnit; changed.push('doseUnit'); }
  if (color !== undefined) { compound.color = color; changed.push('color'); }
  if (kineticsShape !== undefined && KINETICS_SHAPES.includes(kineticsShape)) {
    compound.kineticsShape = kineticsShape;
    changed.push('kineticsShape');
  }
  if (reminderEnabled !== undefined) { compound.reminderEnabled = Boolean(reminderEnabled); changed.push('reminderEnabled'); }
  if (reminderTime !== undefined) {
    compound.reminderTime = HM_RE.test(reminderTime) ? reminderTime : '';
    changed.push('reminderTime');
  }

  try {
    await compound.save();
    if (changed.some((f) => PK_AFFECTING_FIELDS.has(f))) {
      invalidateAsync(req.userId, 'compound-pk-update');
    }
    rlog.info({ compoundId: req.params.id, name: compound.name, changed }, 'compounds: patched');
    res.json({ compound: shapeCustom(compound) });
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
    return res.status(400).json({ error: 'System compounds cannot be deleted. Use PATCH /api/compounds/core/:key with { enabled: false }.' });
  }
  const { deletedCount } = await DoseLog.deleteMany({ userId: req.userId, compoundId: compound._id });
  await compound.deleteOne();
  // Removed dose logs may have been at any past date — full nuke.
  if (deletedCount > 0) invalidateAsync(req.userId, 'compound-delete-with-doses');
  rlog.info(
    { compoundId: req.params.id, name: compound.name, cascadedDoses: deletedCount },
    'compounds: deleted + cascaded dose logs',
  );
  res.status(204).send();
});

export default router;
