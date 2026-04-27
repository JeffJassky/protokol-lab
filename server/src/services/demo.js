// Demo sandbox lifecycle: clone the canonical template into a fresh user,
// shift dates so the data lands at "today," reuse / reset existing sandboxes.
//
// Why a data-driven plan: every collection that hangs off userId needs the
// same treatment (rewrite userId, shift dates, remap FK references to other
// cloned rows). Listing them once in CLONE_PLAN keeps the moving parts
// honest — adding a new logged collection means one new entry, not a new
// branch in five places.

import mongoose from 'mongoose';
import User from '../models/User.js';
import FoodItem from '../models/FoodItem.js';
import Compound from '../models/Compound.js';
import Symptom from '../models/Symptom.js';
import Meal from '../models/Meal.js';
import FoodLog from '../models/FoodLog.js';
import DoseLog from '../models/DoseLog.js';
import WeightLog from '../models/WeightLog.js';
import WaistLog from '../models/WaistLog.js';
import SymptomLog from '../models/SymptomLog.js';
import DayNote from '../models/DayNote.js';
import Photo from '../models/Photo.js';
import UserSettings from '../models/UserSettings.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('demo');

// Order matters: parents first so child FK rewrites can look up the new ids.
const CLONE_PLAN = [
  { name: 'FoodItem', model: FoodItem, dateFields: ['createdAt'] },
  { name: 'Compound', model: Compound, dateFields: ['createdAt', 'updatedAt'] },
  { name: 'Symptom', model: Symptom, dateFields: ['createdAt', 'updatedAt'] },
  {
    name: 'Meal',
    model: Meal,
    dateFields: ['createdAt', 'updatedAt', 'lastLoggedAt'],
    subdocRewrites: [{ path: 'items', refField: 'foodItemId', sourceCollection: 'FoodItem' }],
  },
  {
    name: 'FoodLog',
    model: FoodLog,
    dateFields: ['date', 'createdAt'],
    rewriteRefs: { foodItemId: 'FoodItem', mealId: 'Meal' },
  },
  {
    name: 'DoseLog',
    model: DoseLog,
    dateFields: ['date', 'createdAt'],
    rewriteRefs: { compoundId: 'Compound' },
  },
  { name: 'WeightLog', model: WeightLog, dateFields: ['date', 'createdAt'] },
  { name: 'WaistLog', model: WaistLog, dateFields: ['date', 'createdAt'] },
  {
    name: 'SymptomLog',
    model: SymptomLog,
    dateFields: ['date', 'createdAt', 'updatedAt'],
    rewriteRefs: { symptomId: 'Symptom' },
  },
  { name: 'DayNote', model: DayNote, dateFields: ['date', 'updatedAt'] },
  // Photo.date is a 'YYYY-MM-DD' string, not a Date — shifted as a calendar
  // day, not a timestamp.
  { name: 'Photo', model: Photo, dateFields: ['takenAt', 'createdAt'], dateStringFields: ['date'] },
  { name: 'UserSettings', model: UserSettings, dateFields: ['updatedAt'] },
];

// Logs we look at to find the template's "most recent activity" for delta math.
const TIMELINE_COLLECTIONS = ['FoodLog', 'DoseLog', 'WeightLog', 'WaistLog', 'SymptomLog', 'DayNote', 'Photo'];

function shiftDate(value, deltaMs) {
  if (value == null) return value;
  if (value instanceof Date) return new Date(value.getTime() + deltaMs);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Treat as local-noon to dodge DST edges, then re-format as YYYY-MM-DD.
    const base = new Date(`${value}T12:00:00Z`);
    const shifted = new Date(base.getTime() + deltaMs);
    return shifted.toISOString().slice(0, 10);
  }
  return value;
}

async function computeDateDelta(templateId) {
  let mostRecent = null;
  for (const name of TIMELINE_COLLECTIONS) {
    const spec = CLONE_PLAN.find((s) => s.name === name);
    if (!spec) continue;
    const dateField = (spec.dateFields && spec.dateFields[0])
      || (spec.dateStringFields && spec.dateStringFields[0]);
    if (!dateField) continue;
    const doc = await spec.model
      .findOne({ userId: templateId })
      .sort({ [dateField]: -1 })
      .lean();
    if (!doc) continue;
    let v = doc[dateField];
    if (typeof v === 'string') v = new Date(`${v}T12:00:00Z`);
    if (!(v instanceof Date) || Number.isNaN(v.getTime())) continue;
    if (!mostRecent || v > mostRecent) mostRecent = v;
  }
  if (!mostRecent) return 0;
  return Date.now() - mostRecent.getTime();
}

// Generic per-user copy. Used both to clone the template into a sandbox
// (deltaMs = now - template.lastLogTimestamp) and to seed a new template
// from a real user (deltaMs = 0; preserve original timestamps).
async function copyUserData(sourceUserId, destUserId, { deltaMs = 0 } = {}) {
  const idMaps = new Map(); // collectionName -> Map(oldIdString -> newObjectId)
  let totalDocs = 0;

  for (const spec of CLONE_PLAN) {
    const docs = await spec.model.find({ userId: sourceUserId }).lean();
    const localMap = new Map();
    if (!docs.length) {
      idMaps.set(spec.name, localMap);
      continue;
    }

    const inserts = docs.map((doc) => {
      const next = { ...doc };
      const newId = new mongoose.Types.ObjectId();
      localMap.set(String(doc._id), newId);
      next._id = newId;
      next.userId = destUserId;

      for (const f of spec.dateFields || []) {
        if (next[f] != null) next[f] = shiftDate(next[f], deltaMs);
      }
      for (const f of spec.dateStringFields || []) {
        if (next[f] != null) next[f] = shiftDate(next[f], deltaMs);
      }

      for (const [field, sourceCollection] of Object.entries(spec.rewriteRefs || {})) {
        if (next[field] == null) continue;
        const map = idMaps.get(sourceCollection);
        const mapped = map?.get(String(next[field]));
        if (mapped) next[field] = mapped;
        // No mapping (e.g. mealId of a deleted meal) — leave as-is; the FK is
        // already weak in the schema (see FoodLog.mealId comment).
      }

      for (const sub of spec.subdocRewrites || []) {
        const arr = next[sub.path];
        if (!Array.isArray(arr)) continue;
        const map = idMaps.get(sub.sourceCollection);
        next[sub.path] = arr.map((item) => {
          const nextItem = { ...item, _id: new mongoose.Types.ObjectId() };
          const ref = item[sub.refField];
          if (ref != null) {
            const mapped = map?.get(String(ref));
            if (mapped) nextItem[sub.refField] = mapped;
          }
          return nextItem;
        });
      }

      return next;
    });

    idMaps.set(spec.name, localMap);
    const result = await spec.model.insertMany(inserts, { ordered: false, rawResult: true });
    const insertedCount = result?.insertedCount ?? inserts.length;
    if (insertedCount !== inserts.length) {
      log.warn(
        {
          collection: spec.name,
          sourceUserId: String(sourceUserId),
          destUserId: String(destUserId),
          attempted: inserts.length,
          inserted: insertedCount,
        },
        'demo: copy partial — some docs failed to insert',
      );
    }
    totalDocs += insertedCount;
  }

  log.info(
    { sourceUserId: String(sourceUserId), destUserId: String(destUserId), totalDocs, deltaMs },
    'demo: copy complete',
  );
  return { totalDocs, deltaMs };
}

async function cloneTemplateInto(templateId, sandboxUserId) {
  const deltaMs = await computeDateDelta(templateId);
  return copyUserData(templateId, sandboxUserId, { deltaMs });
}

export async function findTemplate() {
  return User.findOne({ isDemoTemplate: true });
}

// Build a fully-cloned sandbox row (no claim, no cookie). Used both by
// inline /start and by the warm-pool refill job. Plan/onboardingComplete
// match what an anon visitor needs to see every feature without a wizard.
async function buildSandbox({ authUserId = null, isPooled = false } = {}) {
  const template = await findTemplate();
  if (!template) {
    throw new Error('demo template not found — run seeding script');
  }
  const sandbox = await User.create({
    email: `sandbox-${new mongoose.Types.ObjectId()}@demo.local`,
    isDemoSandbox: true,
    parentUserId: authUserId || null,
    lastActiveAt: isPooled ? null : new Date(),
    plan: 'unlimited',
    onboardingComplete: true,
    isPooled,
  });

  try {
    await cloneTemplateInto(template._id, sandbox._id);
  } catch (err) {
    await deleteSandbox(sandbox._id);
    throw err;
  }
  return sandbox;
}

// Atomically claim a pre-cloned sandbox from the warm pool. Returns null
// if the pool is empty — caller should fall back to a synchronous build.
// findOneAndUpdate is the only operation that's safe under concurrency
// here: two simultaneous claims on the last sandbox can't both succeed.
export async function claimPooledSandbox() {
  return User.findOneAndUpdate(
    { isPooled: true, isDemoSandbox: true },
    { $set: { isPooled: false, lastActiveAt: new Date() } },
    { returnDocument: 'after' },
  );
}

// Background-job entry. Keeps `count(isPooled=true) >= target` by building
// new sandboxes one at a time. Slow but acceptable — runs off the request
// path. Scheduler invokes this every minute.
//
// One transient failure (replica blip, e.g.) shouldn't abandon the whole
// tick — keep building. But if the failure is structural (broken template,
// bad data) every attempt will fail; trip a circuit breaker after a few in
// a row so we don't hammer the DB until the next tick.
const REFILL_FAILURE_BREAKER = 3;

export async function refillPool(target = Number(process.env.DEMO_POOL_TARGET) || 3) {
  const template = await findTemplate();
  if (!template) {
    log.warn('demo: refillPool skipped — template not seeded yet');
    return { built: 0, current: 0, target };
  }
  const current = await User.countDocuments({ isPooled: true, isDemoSandbox: true });
  const need = Math.max(0, target - current);
  let built = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  for (let i = 0; i < need; i++) {
    try {
      await buildSandbox({ isPooled: true });
      built++;
      consecutiveFailures = 0;
    } catch (err) {
      failed++;
      consecutiveFailures++;
      log.error(
        { ...errContext(err), consecutiveFailures },
        'demo: refillPool build failed',
      );
      if (consecutiveFailures >= REFILL_FAILURE_BREAKER) {
        log.error(
          { consecutiveFailures, remaining: need - i - 1 },
          'demo: refillPool circuit breaker tripped — abandoning tick',
        );
        break;
      }
    }
  }
  if (built > 0 || failed > 0) {
    log.info(
      { built, failed, current: current + built, target },
      'demo: pool refill tick complete',
    );
  }
  return { built, failed, current: current + built, target };
}

// authUserId === null for anonymous demo. Anonymous claims from the warm
// pool first; falls back to a sync build only when the pool is empty (cold
// boot, target=0, or refill behind on traffic spike). Authed reuses the
// user's existing sandbox if any — keeps experiments intact across toggles
// (PRD §6.2).
export async function getOrCreateSandbox({ authUserId }) {
  if (authUserId) {
    const existing = await User.findOne({
      parentUserId: authUserId,
      isDemoSandbox: true,
    });
    if (existing) {
      existing.lastActiveAt = new Date();
      await existing.save();
      return { sandbox: existing, created: false };
    }
    // Authed users can't claim from the pool — pooled rows have no
    // parentUserId. Build them their own sandbox synchronously.
    const sandbox = await buildSandbox({ authUserId });
    return { sandbox, created: true };
  }

  // Anonymous: prefer a pre-warmed sandbox.
  const claimed = await claimPooledSandbox();
  if (claimed) {
    return { sandbox: claimed, created: true, fromPool: true };
  }

  // Pool empty — build inline. Slow but correct.
  const sandbox = await buildSandbox({ authUserId: null });
  return { sandbox, created: true, fromPool: false };
}

export async function resetSandbox(sandboxId) {
  const template = await findTemplate();
  if (!template) throw new Error('demo template not found');
  const sandbox = await User.findOne({ _id: sandboxId, isDemoSandbox: true });
  if (!sandbox) throw new Error('sandbox not found');

  for (const spec of CLONE_PLAN) {
    await spec.model.deleteMany({ userId: sandbox._id });
  }
  await cloneTemplateInto(template._id, sandbox._id);
  sandbox.lastActiveAt = new Date();
  await sandbox.save();
  return sandbox;
}

export async function deleteSandbox(sandboxId) {
  for (const spec of CLONE_PLAN) {
    await spec.model.deleteMany({ userId: sandboxId });
  }
  await User.deleteOne({ _id: sandboxId, isDemoSandbox: true });
}

// Seed the canonical template from a real user (typically the founder's
// account). Idempotent on a per-source basis: if a template already exists
// it's deleted-and-replaced so a re-run reflects the current source state.
//
// `sanitize` is invoked per-collection-doc giving callers a chance to scrub
// PII (notably DayNote.text). Pass null/undefined to seed with no scrubbing.
export async function seedTemplateFromUser(sourceUserId, { sanitize } = {}) {
  const source = await User.findById(sourceUserId);
  if (!source) throw new Error(`source user not found: ${sourceUserId}`);

  // Drop any existing template + its data first.
  const existing = await User.findOne({ isDemoTemplate: true });
  if (existing) {
    for (const spec of CLONE_PLAN) {
      await spec.model.deleteMany({ userId: existing._id });
    }
    await User.deleteOne({ _id: existing._id });
  }

  const template = await User.create({
    email: `template-${Date.now()}@demo.local`,
    isDemoTemplate: true,
    displayName: source.displayName || 'Jeff',
  });

  // Custom copy with sanitize hook. Mirrors copyUserData but lets the caller
  // mutate or filter docs per-collection before insert.
  const idMaps = new Map();
  let totalDocs = 0;

  for (const spec of CLONE_PLAN) {
    const docs = await spec.model.find({ userId: sourceUserId }).lean();
    const localMap = new Map();
    if (!docs.length) {
      idMaps.set(spec.name, localMap);
      continue;
    }

    const inserts = [];
    for (const doc of docs) {
      const next = { ...doc };
      const newId = new mongoose.Types.ObjectId();
      localMap.set(String(doc._id), newId);
      next._id = newId;
      next.userId = template._id;

      // FK rewrites for refs into prior collections.
      for (const [field, sourceCollection] of Object.entries(spec.rewriteRefs || {})) {
        if (next[field] == null) continue;
        const map = idMaps.get(sourceCollection);
        const mapped = map?.get(String(next[field]));
        if (mapped) next[field] = mapped;
      }
      for (const sub of spec.subdocRewrites || []) {
        const arr = next[sub.path];
        if (!Array.isArray(arr)) continue;
        const map = idMaps.get(sub.sourceCollection);
        next[sub.path] = arr.map((item) => {
          const nextItem = { ...item, _id: new mongoose.Types.ObjectId() };
          const ref = item[sub.refField];
          if (ref != null) {
            const mapped = map?.get(String(ref));
            if (mapped) nextItem[sub.refField] = mapped;
          }
          return nextItem;
        });
      }

      // Sanitize last so callers see the final shape.
      const finalDoc = sanitize ? sanitize(spec.name, next) : next;
      if (finalDoc) inserts.push(finalDoc);
    }
    idMaps.set(spec.name, localMap);
    if (inserts.length) {
      const result = await spec.model.insertMany(inserts, { ordered: false, rawResult: true });
      const insertedCount = result?.insertedCount ?? inserts.length;
      if (insertedCount !== inserts.length) {
        log.warn(
          {
            collection: spec.name,
            sourceUserId: String(sourceUserId),
            templateId: String(template._id),
            attempted: inserts.length,
            inserted: insertedCount,
          },
          'demo: seed partial — some docs failed to insert',
        );
      }
      totalDocs += insertedCount;
    }
  }

  log.info(
    { sourceUserId: String(sourceUserId), templateId: String(template._id), totalDocs },
    'demo: template seeded',
  );
  return { template, totalDocs };
}

export const __test = { CLONE_PLAN, computeDateDelta, shiftDate, cloneTemplateInto, copyUserData };
