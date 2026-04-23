import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
import mongoose from 'mongoose';
import Meal from '../models/Meal.js';
import FoodLog from '../models/FoodLog.js';

await mongoose.connect(process.env.MONGODB_URI);

// Find the most recent FoodLog entry per mealId. createdAt reflects when the
// user actually logged the meal (date is the diary day, which the user can
// backdate, so createdAt is the better signal of "last used").
const rows = await FoodLog.aggregate([
  { $match: { mealId: { $ne: null } } },
  { $group: { _id: '$mealId', lastLoggedAt: { $max: '$createdAt' } } },
]);

let updated = 0;
let skipped = 0;
for (const row of rows) {
  const res = await Meal.updateOne(
    { _id: row._id },
    { $set: { lastLoggedAt: row.lastLoggedAt } },
  );
  if (res.matchedCount) updated += 1;
  else skipped += 1;
}

console.log(`Backfill complete: ${updated} meals updated, ${skipped} orphaned mealIds skipped.`);
await mongoose.disconnect();
