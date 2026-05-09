#!/usr/bin/env node
//
// One-shot migration: convert legacy isSystem=true Compound rows into
// canonical references. After this runs:
//   - Every isSystem=true row in the Compound collection is removed.
//   - User customizations (color, intervalDays, reminderEnabled,
//     reminderTime, enabled, order) are moved into
//     UserSettings.compoundPreferences[<coreInterventionKey>].
//   - DoseLog rows that referenced the old Compound._id are rewritten
//     to use coreInterventionKey instead.
//
// Idempotent — safe to re-run. The matching logic uses core's
// PEPTIDE_BRAND_INDEX so name + brand alias both resolve to a key.
//
// Usage:
//   node src/scripts/migrate-canonical-compounds.js
//
// Or programmatically via `import { runCanonicalCompoundMigration }`.

import 'dotenv/config';
import mongoose from 'mongoose';
import Compound from '../models/Compound.js';
import DoseLog from '../models/DoseLog.js';
import UserSettings from '../models/UserSettings.js';
import { lookupPeptideKey } from '@kyneticbio/core';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('migrate-canonical-compounds');

// Pull preference fields off a legacy Compound row in a single shape.
// Sparse: only keep fields that diverge from what would be the
// catalog default for a fresh user. Conservative — when in doubt, keep
// the value so existing user customization isn't lost.
function extractPreferences(compound) {
  const prefs = {};
  if (compound.enabled === false) prefs.enabled = false;
  // `enabled: true` is the default; don't bother persisting it. The
  // absence of the flag means the user wants it on.
  if (compound.color) prefs.color = compound.color;
  if (Number.isFinite(compound.intervalDays)) prefs.intervalDays = compound.intervalDays;
  if (Number.isFinite(compound.order)) prefs.order = compound.order;
  if (compound.reminderEnabled) prefs.reminderEnabled = true;
  if (compound.reminderTime) prefs.reminderTime = compound.reminderTime;
  return prefs;
}

export async function runCanonicalCompoundMigration({ dryRun = false } = {}) {
  // Pass 1: isSystem=true compounds — the seeded built-ins.
  // Pass 2: isSystem=false rows whose name (or brand) matches a canonical
  //         catalog entry. Common case: user manually created a
  //         "Retatrutide" custom row before the canonical catalog
  //         existed, and dose-logged against it. Those should fold into
  //         the canonical key the same way system rows do.
  const systemCompounds = await Compound.find({ isSystem: true }).lean();
  const customCompounds = await Compound.find({ isSystem: { $ne: true } }).lean();
  log.info(
    { systemCount: systemCompounds.length, customCount: customCompounds.length, dryRun },
    'migration: scanning compounds (system + custom)',
  );

  const stats = {
    scanned: systemCompounds.length + customCompounds.length,
    matchedByName: 0,
    unmatched: 0,
    customSkippedNoMatch: 0,
    doseLogsRewritten: 0,
    preferencesWritten: 0,
    compoundsDeleted: 0,
    skipped: 0,
  };

  for (const compound of [...systemCompounds, ...customCompounds]) {
    const isCustom = !compound.isSystem;
    // Try the canonical name first; fall back to brand-name lookup
    // (covers rows where name was overwritten to "Mounjaro").
    let key = lookupPeptideKey(compound.name);
    if (!key && Array.isArray(compound.brandNames)) {
      for (const brand of compound.brandNames) {
        key = lookupPeptideKey(brand);
        if (key) break;
      }
    }

    if (!key) {
      if (isCustom) {
        // Truly custom row — no canonical match. Leave it alone, that's
        // the whole point of the custom-compound escape hatch.
        stats.customSkippedNoMatch += 1;
        continue;
      }
      // System row with no catalog match. Don't delete — flip to custom
      // so the user keeps the row + their dose history. Rare case:
      // user-created peptide that pre-dated this migration's catalog
      // additions (e.g., a research compound).
      log.warn(
        {
          compoundId: String(compound._id),
          userId: String(compound.userId),
          name: compound.name,
        },
        'migration: no catalog match — converting to custom',
      );
      if (!dryRun) {
        await Compound.updateOne({ _id: compound._id }, { $set: { isSystem: false } });
      }
      stats.unmatched += 1;
      continue;
    }

    stats.matchedByName += 1;
    const userId = compound.userId;
    const prefs = extractPreferences(compound);

    if (!dryRun) {
      // Merge per-compound prefs into UserSettings.compoundPreferences[key].
      // $setOnInsert seeds the doc when the user has no UserSettings yet
      // (rare but possible — pre-onboarding accounts).
      if (Object.keys(prefs).length) {
        await UserSettings.updateOne(
          { userId },
          {
            $set: Object.fromEntries(
              Object.entries(prefs).map(([k, v]) => [`compoundPreferences.${key}.${k}`, v]),
            ),
            $setOnInsert: { userId },
          },
          { upsert: true },
        );
        stats.preferencesWritten += 1;
      }

      // Rewrite all DoseLog entries that referenced this Compound row.
      // Set coreInterventionKey + null out compoundId in one update
      // — exactly-one constraint stays satisfied through validators
      // because we use updateMany (skips schema-level pre-validate).
      const result = await DoseLog.updateMany(
        { compoundId: compound._id },
        { $set: { coreInterventionKey: key, compoundId: null } },
      );
      stats.doseLogsRewritten += result.modifiedCount || 0;

      // Delete the old Compound row. DoseLog's pre('validate') hook
      // would reject any future inserts referencing this _id.
      await Compound.deleteOne({ _id: compound._id });
      stats.compoundsDeleted += 1;
    }
  }

  log.info(stats, 'migration: complete');
  return stats;
}

// CLI entry. When run as `node migrate-canonical-compounds.js`, connect,
// run, disconnect.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    log.error('MONGODB_URI not set — aborting');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri);
    const dryRun = process.argv.includes('--dry-run');
    const stats = await runCanonicalCompoundMigration({ dryRun });
    log.info(stats, 'CLI migration finished');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    log.error(errContext(err), 'CLI migration failed');
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}
