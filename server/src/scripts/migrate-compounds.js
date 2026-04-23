// Stage 1 migration: move from single-hardcoded-retatrutide to a catalog of
// compounds the user manages in settings.
//
// What it does (per user, idempotent):
//   1. Ensure every system compound exists for the user.
//   2. If the user had a UserSettings.doseIntervalDays value, copy it onto
//      their Retatrutide compound and enable it.
//   3. For every DoseLog that still has a `compound` string or `doseMg` field:
//      a. Resolve the target compound (by name for legacy string; default to
//         Retatrutide).
//      b. Set `compoundId`, copy `doseMg` → `value`.
//      c. Unset the old fields.
//   4. Unset UserSettings.doseIntervalDays.
//
// Run:
//   node src/scripts/migrate-compounds.js           # apply
//   node src/scripts/migrate-compounds.js --dry-run # report only

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
import mongoose from 'mongoose';
import UserSettings from '../models/UserSettings.js';
import DoseLog from '../models/DoseLog.js';
import Compound from '../models/Compound.js';

const DRY = process.argv.includes('--dry-run');

const SYSTEM_COMPOUNDS = [
  { name: 'Retatrutide',  halfLifeDays: 6,    intervalDays: 7, doseUnit: 'mg',  color: '#f59e0b', enabledByDefault: true },
  { name: 'Tirzepatide',  halfLifeDays: 5,    intervalDays: 7, doseUnit: 'mg',  color: '#10b981', enabledByDefault: false },
  { name: 'Semaglutide',  halfLifeDays: 7,    intervalDays: 7, doseUnit: 'mg',  color: '#3b82f6', enabledByDefault: false },
  { name: 'Cagrilintide', halfLifeDays: 7,    intervalDays: 7, doseUnit: 'mg',  color: '#8b5cf6', enabledByDefault: false },
  { name: 'BPC-157',      halfLifeDays: 0.25, intervalDays: 1, doseUnit: 'mcg', color: '#ec4899', enabledByDefault: false },
];

await mongoose.connect(process.env.MONGODB_URI);
console.log(`[migrate-compounds] ${DRY ? 'DRY RUN' : 'APPLYING'}`);

const users = await UserSettings.find({}).select('userId doseIntervalDays').lean();
console.log(`[migrate-compounds] ${users.length} user(s) with settings`);

let seeded = 0;
let dosesRepointed = 0;
let settingsCleaned = 0;

for (const u of users) {
  // 1. Seed any missing system compounds.
  const existing = await Compound.find({ userId: u.userId, isSystem: true }).select('name').lean();
  const have = new Set(existing.map((c) => c.name));
  const missing = SYSTEM_COMPOUNDS.filter((c) => !have.has(c.name));
  if (missing.length) {
    const docs = missing.map((c, i) => ({
      userId: u.userId,
      name: c.name,
      isSystem: true,
      enabled: c.enabledByDefault,
      halfLifeDays: c.halfLifeDays,
      intervalDays: c.intervalDays,
      doseUnit: c.doseUnit,
      color: c.color,
      order: i,
    }));
    if (!DRY) {
      try { await Compound.insertMany(docs, { ordered: false }); }
      catch (err) { if (err.code !== 11000) throw err; }
    }
    seeded += docs.length;
  }

  // 2. Apply the user's saved dose-interval to Retatrutide.
  const reta = await Compound.findOne({ userId: u.userId, isSystem: true, name: 'Retatrutide' });
  if (reta && u.doseIntervalDays && u.doseIntervalDays !== reta.intervalDays) {
    if (!DRY) {
      reta.intervalDays = u.doseIntervalDays;
      reta.enabled = true;
      await reta.save();
    }
  }

  // 3. Repoint DoseLogs. Use the raw collection so we can see fields Mongoose
  // would otherwise strip from the now-trimmed schema.
  const raw = DoseLog.collection;
  const legacy = await raw.find({
    userId: u.userId,
    $or: [{ compound: { $exists: true } }, { doseMg: { $exists: true } }, { compoundId: { $exists: false } }],
  }).toArray();

  for (const doc of legacy) {
    const name = doc.compound || 'Retatrutide';
    let target = await Compound.findOne({ userId: u.userId, name });
    if (!target) target = reta; // Fallback if name is unknown.
    if (!target) {
      console.warn(`[migrate-compounds] No compound found for DoseLog ${doc._id}, skipping`);
      continue;
    }
    const update = {
      $set: { compoundId: target._id, value: doc.value ?? doc.doseMg },
      $unset: { compound: '', doseMg: '' },
    };
    if (!DRY) await raw.updateOne({ _id: doc._id }, update);
    dosesRepointed += 1;
  }
}

// 4. Strip doseIntervalDays from every UserSettings doc.
const cleanupFilter = { doseIntervalDays: { $exists: true } };
const cleanupCount = await UserSettings.collection.countDocuments(cleanupFilter);
if (!DRY && cleanupCount) {
  const r = await UserSettings.collection.updateMany(cleanupFilter, { $unset: { doseIntervalDays: '' } });
  settingsCleaned = r.modifiedCount;
} else {
  settingsCleaned = cleanupCount;
}

console.log(`[migrate-compounds] system compounds seeded: ${seeded}`);
console.log(`[migrate-compounds] dose logs repointed: ${dosesRepointed}`);
console.log(`[migrate-compounds] UserSettings cleaned: ${settingsCleaned}`);
if (DRY) console.log('[migrate-compounds] (dry run — nothing written)');

await mongoose.disconnect();
