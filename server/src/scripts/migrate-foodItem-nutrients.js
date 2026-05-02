// Migrate every FoodItem from the legacy flat-macros schema to the new
// perServing subdoc schema.
//
// Old shape:
//   { caloriesPer, proteinPer, fatPer, carbsPer, servingGrams, servingSize }
// New shape:
//   { perServing: { calories, protein, fat, carbs, ... },
//     servingAmount, servingUnit, servingKnown,
//     nutrientSource, nutrientCoverage }
//
// Idempotent: skips any doc that already has perServing.calories set.
// Old fields are unset after a successful copy so the schema stays clean.
//
// Run:
//   node src/scripts/migrate-foodItem-nutrients.js           # apply
//   node src/scripts/migrate-foodItem-nutrients.js --dry-run # report only

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
import mongoose from 'mongoose';

const DRY = process.argv.includes('--dry-run');

await mongoose.connect(process.env.MONGODB_URI);
console.log(`[migrate-fooditem] ${DRY ? 'DRY RUN' : 'APPLYING'}`);

// Operate on the raw collection so legacy fields (caloriesPer etc.) are
// readable even after the Mongoose schema dropped them.
const coll = mongoose.connection.collection('fooditems');

// Try to extract a numeric quantity + unit from a free-text serving label.
// Examples:
//   "170 g"            → { amount: 170, unit: 'g' }
//   "1 cup (158g)"     → { amount: 158, unit: 'g' }
//   "330 ml"           → { amount: 330, unit: 'ml' }
//   "1 medium"         → null (no parseable amount)
function parseServingSize(str) {
  if (!str || typeof str !== 'string') return null;
  // Look for "<number> <unit>" anywhere in the string.
  const m = str.match(/(\d+(?:\.\d+)?)\s*(g|ml|oz|fl\s*oz|cl|dl|l|kg|lb)\b/i);
  if (!m) return null;
  const amount = Number(m[1]);
  const rawUnit = m[2].toLowerCase().replace(/\s+/g, '');
  switch (rawUnit) {
    case 'g': return { amount, unit: 'g' };
    case 'kg': return { amount: amount * 1000, unit: 'g' };
    case 'oz': return { amount: amount * 28.3495, unit: 'g' };
    case 'lb': return { amount: amount * 453.592, unit: 'g' };
    case 'ml': return { amount, unit: 'ml' };
    case 'cl': return { amount: amount * 10, unit: 'ml' };
    case 'dl': return { amount: amount * 100, unit: 'ml' };
    case 'l':  return { amount: amount * 1000, unit: 'ml' };
    case 'floz': return { amount: amount * 29.5735, unit: 'ml' };
    default: return null;
  }
}

const cursor = coll.find({});
let scanned = 0;
let skipped = 0;
let migrated = 0;
let unsetOnly = 0;

while (await cursor.hasNext()) {
  const doc = await cursor.next();
  scanned += 1;

  const hasNew = doc.perServing && doc.perServing.calories != null;
  const hasLegacy = doc.caloriesPer != null;

  if (!hasNew && !hasLegacy) {
    // Nothing to migrate and nothing to seed.
    skipped += 1;
    continue;
  }

  const legacyKeys = ['caloriesPer', 'proteinPer', 'fatPer', 'carbsPer', 'servingGrams'];
  const legacyPresent = legacyKeys.filter((k) => doc[k] != null);

  if (hasNew && legacyPresent.length === 0) {
    // Already migrated.
    skipped += 1;
    continue;
  }

  const update = { $set: {}, $unset: {} };

  if (!hasNew && hasLegacy) {
    // Build perServing from legacy macros.
    const ps = {};
    if (doc.caloriesPer != null) ps.calories = Number(doc.caloriesPer);
    if (doc.proteinPer != null) ps.protein = Number(doc.proteinPer);
    if (doc.fatPer != null) ps.fat = Number(doc.fatPer);
    if (doc.carbsPer != null) ps.carbs = Number(doc.carbsPer);
    update.$set.perServing = ps;

    // Derive serving fields. Legacy servingGrams was always grams.
    let servingAmount = null;
    let servingUnit = null;
    let servingKnown = false;
    if (doc.servingGrams != null && Number(doc.servingGrams) > 0) {
      servingAmount = Number(doc.servingGrams);
      servingUnit = 'g';
      servingKnown = true;
    } else {
      // Try to parse the human serving label.
      const parsed = parseServingSize(doc.servingSize);
      if (parsed) {
        servingAmount = parsed.amount;
        servingUnit = parsed.unit;
        servingKnown = true;
      }
    }
    update.$set.servingAmount = servingAmount;
    update.$set.servingUnit = servingUnit;
    update.$set.servingKnown = servingKnown;

    // Provenance — best guess from existing identity.
    update.$set.nutrientSource = doc.offBarcode
      ? 'openfoodfacts'
      : (doc.isCustom ? 'manual' : 'manual');
    update.$set.nutrientCoverage = 'macros_only';

    migrated += 1;
  } else {
    // Already on new shape but legacy fields lingering — just clean.
    unsetOnly += 1;
  }

  for (const k of legacyPresent) update.$unset[k] = '';
  if (Object.keys(update.$set).length === 0) delete update.$set;
  if (Object.keys(update.$unset).length === 0) delete update.$unset;

  if (DRY) continue;
  await coll.updateOne({ _id: doc._id }, update);
}

console.log(`[migrate-fooditem] scanned=${scanned} migrated=${migrated} cleaned=${unsetOnly} skipped=${skipped}`);
await mongoose.disconnect();
