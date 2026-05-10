import { Router } from 'express';
import UserSettings from '../models/UserSettings.js';
import WeightLog from '../models/WeightLog.js';
import { childLogger } from '../lib/logger.js';
import {
  sanitizeBloodworkValue,
  expandBloodworkFlat,
} from '../../../shared/bio/bloodworkPanels.js';
import { sanitizeConditionsState } from '../../../shared/bio/conditionsCatalog.js';
import {
  sanitizeGeneticsValue,
  expandGeneticsFlat,
} from '../../../shared/bio/geneticsPanels.js';
import { PEPTIDE_CATALOG_INDEX } from '@kyneticbio/core';
import { invalidateAsync } from '../sim/invalidationHooks.js';

const log = childLogger('settings');
const router = Router();

// Subject fields the sim engine reads. Any write that touches one of
// these invalidates the entire latestSimCheckpoint — there's no
// time-stamped subject history, so changing weight or bloodwork makes
// every cached past day's sim wrong by definition.
const SIM_AFFECTING_FIELDS = [
  'sex', 'age', 'heightInches', 'currentWeightLbs',
  'bloodwork', 'conditions', 'genetics', 'menstruation',
];

function touchesSim(body) {
  return SIM_AFFECTING_FIELDS.some((k) => body[k] !== undefined);
}

const ACTIVITY = ['sedentary', 'light', 'moderate', 'very', 'athlete'];
const FASTING_KINDS = ['none', 'daily', 'weekly'];
const HM_RE = /^\d{1,2}:\d{2}$/;

// Coerce + clamp the fasting subdocument from a request body. Unknown keys
// are dropped; missing keys default to schema defaults so a partial UI patch
// doesn't accidentally null out other knobs.
function sanitizeFasting(input) {
  const f = input || {};
  const kind = FASTING_KINDS.includes(f.kind) ? f.kind : 'daily';
  const dailyStart = HM_RE.test(f.dailyStartTime) ? f.dailyStartTime : '20:00';
  const dur = Number.isFinite(Number(f.fastDurationMinutes))
    ? Math.max(15, Math.min(72 * 60, Math.round(Number(f.fastDurationMinutes))))
    : 16 * 60;
  const weeklyRules = Array.isArray(f.weeklyRules)
    ? f.weeklyRules
        .filter((r) => r && Number.isInteger(r.weekday) && r.weekday >= 0 && r.weekday <= 6)
        .map((r) => ({
          weekday: r.weekday,
          startTime: HM_RE.test(r.startTime) ? r.startTime : dailyStart,
          durationMinutes: Number.isFinite(Number(r.durationMinutes))
            ? Math.max(15, Math.min(72 * 60, Math.round(Number(r.durationMinutes))))
            : dur,
        }))
    : [];
  const n = f.notifications || {};
  const eventOffset = (e) => {
    const obj = e || {};
    const raw = Number(obj.minutesBefore);
    const m = Number.isFinite(raw) ? Math.max(0, Math.min(720, Math.round(raw))) : 0;
    return { enabled: obj.enabled !== false, minutesBefore: m };
  };
  return {
    enabled: Boolean(f.enabled),
    showOnLog: f.showOnLog !== false,
    showOnDashboard: f.showOnDashboard !== false,
    kind,
    protocol: typeof f.protocol === 'string' ? f.protocol.slice(0, 16) : '16:8',
    fastDurationMinutes: dur,
    dailyStartTime: dailyStart,
    weeklyRules,
    ianaTz: typeof f.ianaTz === 'string' ? f.ianaTz.slice(0, 64) : 'UTC',
    notifications: {
      enabled: Boolean(n.enabled),
      fastStart: eventOffset(n.fastStart),
      fastEnd:   eventOffset(n.fastEnd),
    },
  };
}

const WATER_UNITS = ['ml', 'fl_oz'];

function sanitizePhotos(input) {
  const p = input || {};
  return {
    enabled: Boolean(p.enabled),
    showOnLog: p.showOnLog == null ? true : Boolean(p.showOnLog),
    showOnDashboard: p.showOnDashboard == null ? true : Boolean(p.showOnDashboard),
  };
}

// Sanitize the compoundPreferences map. Each value is a partial spec
// — only fields the user explicitly customized are kept. Unknown
// canonical keys are filtered against core's PEPTIDE_CATALOG_INDEX so a
// stale client can't pollute the doc with garbage keys. Boolean and
// numeric fields are coerced; strings are trimmed and length-capped.
function sanitizeCompoundPreferences(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!key || typeof key !== 'string') continue;
    if (!PEPTIDE_CATALOG_INDEX.has(key)) continue;
    if (!raw || typeof raw !== 'object') continue;
    const cleaned = {};
    if (raw.enabled != null) cleaned.enabled = Boolean(raw.enabled);
    if (raw.color != null && typeof raw.color === 'string') {
      cleaned.color = raw.color.slice(0, 16);
    }
    if (Number.isFinite(Number(raw.intervalDays))) {
      cleaned.intervalDays = Math.max(0.5, Math.min(30, Number(raw.intervalDays)));
    }
    if (Number.isFinite(Number(raw.order))) cleaned.order = Math.round(Number(raw.order));
    if (raw.reminderEnabled != null) cleaned.reminderEnabled = Boolean(raw.reminderEnabled);
    if (raw.reminderTime != null && typeof raw.reminderTime === 'string') {
      cleaned.reminderTime = raw.reminderTime.slice(0, 8); // HH:mm tolerance
    }
    if (Object.keys(cleaned).length) out[key] = cleaned;
  }
  return out;
}

function sanitizeJournal(input) {
  const j = input || {};
  return {
    enabled: j.enabled == null ? true : Boolean(j.enabled),
  };
}

function sanitizeInsights(input) {
  const i = input || {};
  const raw = Number(i.minConfidence);
  const min = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.4;
  return {
    enabled: i.enabled == null ? true : Boolean(i.enabled),
    minConfidence: min,
  };
}

function sanitizeTracking(input) {
  const t = input || {};
  const mode = ['passive', 'affirmative'].includes(t.confirmationMode) ? t.confirmationMode : 'passive';
  return { confirmationMode: mode };
}

function sanitizeExercise(input) {
  const e = input || {};
  const mode = ['baseline', 'earn', 'hidden'].includes(e.energyMode) ? e.energyMode : 'baseline';
  return {
    enabled: Boolean(e.enabled),
    showOnLog: e.showOnLog == null ? true : Boolean(e.showOnLog),
    showOnDashboard: e.showOnDashboard == null ? true : Boolean(e.showOnDashboard),
    energyMode: mode,
  };
}

function sanitizeBloodwork(input) {
  // Accepts either flat `{ 'metabolic.glucose_mg_dL': 95 }` or nested
  // `{ metabolic: { glucose_mg_dL: 95 } }` and emits the nested shape the
  // engine expects. Drops anything not in the panel index — protects
  // against agent typos or stale clients writing unknown fields.
  if (!input || typeof input !== 'object') return {};
  const flat = {};
  // Detect shape: if first value is an object, treat as nested.
  const first = Object.values(input)[0];
  if (first && typeof first === 'object') {
    for (const [panel, fields] of Object.entries(input)) {
      if (!fields || typeof fields !== 'object') continue;
      for (const [field, value] of Object.entries(fields)) {
        flat[`${panel}.${field}`] = value;
      }
    }
  } else {
    Object.assign(flat, input);
  }
  const cleaned = {};
  for (const [dotPath, raw] of Object.entries(flat)) {
    const v = sanitizeBloodworkValue(dotPath, raw);
    if (v == null) continue;
    cleaned[dotPath] = v;
  }
  return expandBloodworkFlat(cleaned);
}

function sanitizeGenetics(input) {
  // Same flat-or-nested forgiveness as bloodwork. Drops anything not in
  // the curated panels (so the agent or a stale client can't write
  // unrecognized markers).
  if (!input || typeof input !== 'object') return {};
  const flat = {};
  const first = Object.values(input)[0];
  if (first && typeof first === 'object') {
    for (const [panel, fields] of Object.entries(input)) {
      if (!fields || typeof fields !== 'object') continue;
      for (const [field, value] of Object.entries(fields)) {
        flat[`${panel}.${field}`] = value;
      }
    }
  } else {
    Object.assign(flat, input);
  }
  const cleaned = {};
  for (const [dotPath, raw] of Object.entries(flat)) {
    const v = sanitizeGeneticsValue(dotPath, raw);
    if (v == null) continue;
    cleaned[dotPath] = v;
  }
  return expandGeneticsFlat(cleaned);
}

function sanitizeMenstruation(input) {
  const m = input || {};
  let last = null;
  if (m.lastPeriodStart) {
    const d = new Date(m.lastPeriodStart);
    if (!Number.isNaN(d.getTime())) last = d;
  }
  const cycle = Number.isFinite(Number(m.cycleLength))
    ? Math.max(15, Math.min(60, Math.round(Number(m.cycleLength))))
    : 28;
  const luteal = Number.isFinite(Number(m.lutealPhaseLength))
    ? Math.max(7, Math.min(20, Math.round(Number(m.lutealPhaseLength))))
    : 14;

  const n = m.notifications || {};
  // HH:MM 24h. Anything malformed falls back to 09:00 — same lenient
  // approach as trackReminder.
  const time = typeof n.time === 'string' && /^\d{2}:\d{2}$/.test(n.time) ? n.time : '09:00';
  const ev = (e, defaultDaysBefore = 0, key = 'daysBefore') => {
    const obj = e || {};
    const raw = Number(obj[key]);
    const days = Number.isFinite(raw)
      ? Math.max(0, Math.min(14, Math.round(raw)))
      : defaultDaysBefore;
    return { enabled: Boolean(obj.enabled), [key]: days };
  };

  return {
    enabled: Boolean(m.enabled),
    lastPeriodStart: last,
    cycleLength: cycle,
    lutealPhaseLength: luteal,
    showOnLog: m.showOnLog == null ? true : Boolean(m.showOnLog),
    showOnDashboard: m.showOnDashboard == null ? true : Boolean(m.showOnDashboard),
    notifications: {
      enabled: Boolean(n.enabled),
      time,
      periodExpected:    ev(n.periodExpected,    1, 'daysBefore'),
      ovulationExpected: ev(n.ovulationExpected, 0, 'daysBefore'),
      fertileWindow:     ev(n.fertileWindow,     0, 'daysBefore'),
      pmsWindow:         ev(n.pmsWindow,         5, 'daysBefore'),
      latePeriod:        ev(n.latePeriod,        2, 'daysAfter'),
    },
  };
}

function sanitizeWater(input) {
  const w = input || {};
  const unit = WATER_UNITS.includes(w.unit) ? w.unit : 'fl_oz';
  const target = Number.isFinite(Number(w.dailyTargetMl))
    ? Math.max(100, Math.min(10000, Math.round(Number(w.dailyTargetMl))))
    : 2000;
  const serving = Number.isFinite(Number(w.servingMl))
    ? Math.max(30, Math.min(2000, Math.round(Number(w.servingMl))))
    : 250;
  return {
    enabled: Boolean(w.enabled),
    unit,
    dailyTargetMl: target,
    servingMl: serving,
    showOnDashboard: Boolean(w.showOnDashboard),
  };
}

// Internal-only fields that should never leak to the client. The sim
// checkpoint's endState is a giant ODE state vector (thousands of
// numeric props) — sending it on every settings fetch bloats responses
// AND has tripped Vue/Worker structured-clone in the past when the
// reactive copy ended up in worker postMessage payloads.
const SETTINGS_PROJECTION = '-latestSimCheckpoint';

// Strip internal-only fields from a Mongoose doc before serializing.
// Use after findOneAndUpdate (which doesn't support `.select()` on
// the returned doc cleanly).
function stripInternal(doc) {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  delete obj.latestSimCheckpoint;
  return obj;
}

router.get('/', async (req, res) => {
  const settings = await UserSettings.findOne({ userId: req.userId }).select(SETTINGS_PROJECTION);

  // One-shot migration: the legacy `bmr` field was overloaded — users were
  // entering their TDEE there because the calorie-delta math (calories - bmr)
  // only makes sense against daily burn. Move that value to `tdee` and clear
  // `bmr` so a fresh Mifflin BMR can be auto-computed from sex/age/h/w later.
  // Idempotent: skipped once `tdee` is populated.
  if (settings && settings.tdee == null && settings.bmr != null) {
    settings.tdee = settings.bmr;
    settings.bmr = null;
    await settings.save();
    (req.log || log).info(
      { userId: String(req.userId), tdee: settings.tdee },
      'settings: migrated legacy bmr value to tdee',
    );
  }

  (req.log || log).debug({ hasSettings: Boolean(settings) }, 'settings: fetched');
  res.json({ settings });
});

// Upsert. Sets only fields that are explicitly provided so that callers which
// don't know about every field (legacy Settings form vs. wizard) don't wipe
// fields they didn't touch. Equivalent to the PATCH below — kept on PUT for
// the legacy client.
router.put('/', async (req, res) => {
  const allowed = [
    'sex', 'age', 'heightInches', 'currentWeightLbs', 'goalWeightLbs', 'bmr', 'tdee',
    'activityLevel', 'goalRateLbsPerWeek', 'targets', 'timezone', 'unitSystem',
  ];
  const set = { updatedAt: new Date() };
  for (const k of allowed) {
    if (req.body[k] !== undefined) set[k] = req.body[k];
  }
  if (set.activityLevel && !ACTIVITY.includes(set.activityLevel)) {
    return res.status(400).json({ error: 'invalid activityLevel' });
  }
  if (req.body.trackReminder !== undefined) {
    set.trackReminder = {
      enabled: Boolean(req.body.trackReminder.enabled),
      time: req.body.trackReminder.time || '20:00',
    };
  }
  if (req.body.fasting !== undefined) {
    set.fasting = sanitizeFasting(req.body.fasting);
  }
  if (req.body.water !== undefined) {
    set.water = sanitizeWater(req.body.water);
  }
  if (req.body.photos !== undefined) {
    set.photos = sanitizePhotos(req.body.photos);
  }
  if (req.body.menstruation !== undefined) {
    set.menstruation = sanitizeMenstruation(req.body.menstruation);
  }
  if (req.body.bloodwork !== undefined) {
    set.bloodwork = sanitizeBloodwork(req.body.bloodwork);
  }
  if (req.body.exercise !== undefined) {
    set.exercise = sanitizeExercise(req.body.exercise);
  }
  if (req.body.tracking !== undefined) {
    set.tracking = sanitizeTracking(req.body.tracking);
  }
  if (req.body.journal !== undefined) {
    set.journal = sanitizeJournal(req.body.journal);
  }
  if (req.body.insights !== undefined) {
    set.insights = sanitizeInsights(req.body.insights);
  }
  if (req.body.compoundPreferences !== undefined) {
    set.compoundPreferences = sanitizeCompoundPreferences(req.body.compoundPreferences);
  }
  if (req.body.conditions !== undefined) {
    set.conditions = sanitizeConditionsState(req.body.conditions);
  }
  if (req.body.genetics !== undefined) {
    set.genetics = sanitizeGenetics(req.body.genetics);
  }

  const settings = await UserSettings.findOneAndUpdate(
    { userId: req.userId },
    { $set: set, $setOnInsert: { userId: req.userId } },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );

  if (touchesSim(req.body)) invalidateAsync(req.userId, 'settings-put');
  (req.log || log).info(
    { fields: Object.keys(set).filter((k) => k !== 'updatedAt') },
    'settings: full update',
  );
  res.json({ settings: stripInternal(settings) });
});

// Partial upsert. Used by the onboarding wizard so each step persists only
// the fields it touched without clearing fields the user hasn't reached yet.
router.patch('/', async (req, res) => {
  const allowed = [
    'sex', 'age', 'heightInches', 'currentWeightLbs', 'goalWeightLbs', 'bmr', 'tdee',
    'activityLevel', 'goalRateLbsPerWeek', 'targets', 'timezone', 'unitSystem',
  ];
  const set = { updatedAt: new Date() };
  for (const k of allowed) {
    if (req.body[k] !== undefined) set[k] = req.body[k];
  }
  if (set.activityLevel && !ACTIVITY.includes(set.activityLevel)) {
    return res.status(400).json({ error: 'invalid activityLevel' });
  }
  if (req.body.trackReminder !== undefined) {
    set.trackReminder = {
      enabled: Boolean(req.body.trackReminder.enabled),
      time: req.body.trackReminder.time || '20:00',
    };
  }
  if (req.body.fasting !== undefined) {
    set.fasting = sanitizeFasting(req.body.fasting);
  }
  if (req.body.water !== undefined) {
    set.water = sanitizeWater(req.body.water);
  }
  if (req.body.photos !== undefined) {
    set.photos = sanitizePhotos(req.body.photos);
  }
  if (req.body.menstruation !== undefined) {
    set.menstruation = sanitizeMenstruation(req.body.menstruation);
  }
  if (req.body.bloodwork !== undefined) {
    set.bloodwork = sanitizeBloodwork(req.body.bloodwork);
  }
  if (req.body.exercise !== undefined) {
    set.exercise = sanitizeExercise(req.body.exercise);
  }
  if (req.body.tracking !== undefined) {
    set.tracking = sanitizeTracking(req.body.tracking);
  }
  if (req.body.journal !== undefined) {
    set.journal = sanitizeJournal(req.body.journal);
  }
  if (req.body.insights !== undefined) {
    set.insights = sanitizeInsights(req.body.insights);
  }
  if (req.body.compoundPreferences !== undefined) {
    set.compoundPreferences = sanitizeCompoundPreferences(req.body.compoundPreferences);
  }
  if (req.body.conditions !== undefined) {
    set.conditions = sanitizeConditionsState(req.body.conditions);
  }
  if (req.body.genetics !== undefined) {
    set.genetics = sanitizeGenetics(req.body.genetics);
  }

  const settings = await UserSettings.findOneAndUpdate(
    { userId: req.userId },
    { $set: set, $setOnInsert: { userId: req.userId } },
    { upsert: true, new: true, runValidators: true },
  );

  if (touchesSim(req.body)) invalidateAsync(req.userId, 'settings-patch');

  // When the wizard's "basics" step writes the user's current weight, also
  // drop a WeightLog for today if they don't have one yet — gives them a real
  // first data point so the dashboard isn't empty on day one. Idempotent: a
  // pre-existing today entry (e.g. user manually logged before finishing the
  // wizard, or revisits the basics step) is left alone.
  if (req.body.currentWeightLbs !== undefined) {
    const w = Number(req.body.currentWeightLbs);
    if (Number.isFinite(w) && w > 0) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      const existing = await WeightLog.findOne({
        userId: req.userId,
        date: { $gte: dayStart, $lt: dayEnd },
      });
      if (!existing) {
        await WeightLog.create({
          userId: req.userId,
          weightLbs: w,
          date: new Date(),
        });
        (req.log || log).info(
          { userId: String(req.userId), weightLbs: w },
          'settings: auto-logged weight from currentWeightLbs',
        );
      }
    }
  }

  (req.log || log).info(
    { fields: Object.keys(set).filter((k) => k !== 'updatedAt') },
    'settings: patched',
  );
  res.json({ settings: stripInternal(settings) });
});

router.patch('/notifications', async (req, res) => {
  const { timezone, trackReminder } = req.body || {};
  const update = {};
  if (timezone !== undefined) update.timezone = timezone;
  if (trackReminder !== undefined) {
    update.trackReminder = {
      enabled: Boolean(trackReminder.enabled),
      time: trackReminder.time || '20:00',
    };
  }
  const settings = await UserSettings.findOneAndUpdate(
    { userId: req.userId },
    { $set: update },
    { new: true },
  );
  (req.log || log).info(
    { timezone, trackReminderEnabled: settings?.trackReminder?.enabled, trackReminderTime: settings?.trackReminder?.time },
    'settings: notifications patched',
  );
  res.json({ settings: stripInternal(settings) });
});

export default router;
