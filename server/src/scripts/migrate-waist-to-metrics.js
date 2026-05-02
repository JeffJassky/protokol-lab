// Migrate every WaistLog row into the unified Metric / MetricLog system.
//
// Per user:
//   1. Ensure a `waist` preset Metric exists (enabled, isPreset, length).
//   2. For each WaistLog: upsert a MetricLog at the same date, value
//      converted from inches → cm (canonical for length).
//
// Idempotent: re-running skips logs already migrated for the same
// (user, metric, date) tuple via the MetricLog unique index.
//
// Run:
//   node src/scripts/migrate-waist-to-metrics.js           # apply
//   node src/scripts/migrate-waist-to-metrics.js --dry-run # report only
//
// After this script reports zero new rows on a second consecutive run,
// the legacy WaistLog model + routes + UI can be removed safely.

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
import mongoose from 'mongoose';
import WaistLog from '../models/WaistLog.js';
import Metric from '../models/Metric.js';
import MetricLog from '../models/MetricLog.js';
import { toCanonical } from '../../../shared/units.js';
import { findPreset } from '../../../shared/metricPresets.js';

const DRY = process.argv.includes('--dry-run');

await mongoose.connect(process.env.MONGODB_URI);
console.log(`[migrate-waist] ${DRY ? 'DRY RUN' : 'APPLYING'}`);

const waistPreset = findPreset('waist');
if (!waistPreset) {
  console.error('[migrate-waist] waist preset missing from metricPresets.js — aborting');
  await mongoose.disconnect();
  process.exit(1);
}

const userIds = await WaistLog.distinct('userId');
console.log(`[migrate-waist] ${userIds.length} user(s) with waist data`);

let metricsCreated = 0;
let logsCopied = 0;
let logsSkipped = 0;

for (const userId of userIds) {
  // 1. Ensure the waist Metric row exists for this user. If they already had
  //    one (from a prior partial run, or seeded but disabled), just enable it.
  let metric = await Metric.findOne({ userId, key: 'waist' });
  if (!metric) {
    if (!DRY) {
      metric = await Metric.create({
        userId,
        key: waistPreset.key,
        name: waistPreset.name,
        category: waistPreset.category,
        dimension: waistPreset.dimension,
        isPreset: true,
        enabled: true,
        order: 0,
      });
    }
    metricsCreated += 1;
    console.log(`  [user ${userId}] created waist metric`);
  } else if (!metric.enabled) {
    if (!DRY) {
      metric.enabled = true;
      await metric.save();
    }
    console.log(`  [user ${userId}] re-enabled existing waist metric`);
  }

  // 2. Copy each WaistLog over. Cannot use insertMany w/ ordered:false +
  //    duplicate-key swallow because we need an accurate `copied` count, so
  //    upsert one at a time. Volume is small (one row per logged day per
  //    user — practically never more than a few hundred per user).
  const waistLogs = await WaistLog.find({ userId }).lean();
  for (const wl of waistLogs) {
    const valueCm = toCanonical(wl.waistInches, 'in');
    if (DRY) {
      const existing = await MetricLog.findOne({
        userId,
        metricId: metric?._id || null, // dry: metric may not exist yet
        date: wl.date,
      });
      if (existing) logsSkipped += 1;
      else logsCopied += 1;
      continue;
    }
    try {
      await MetricLog.create({
        userId,
        metricId: metric._id,
        date: wl.date,
        value: valueCm,
      });
      logsCopied += 1;
    } catch (err) {
      if (err.code === 11000) {
        logsSkipped += 1;
      } else {
        throw err;
      }
    }
  }
}

console.log(
  `[migrate-waist] done: ${metricsCreated} metric(s) created, ${logsCopied} log(s) copied, ${logsSkipped} skipped (already migrated)`,
);

await mongoose.disconnect();
