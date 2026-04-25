// One-shot cleanup of test-scaffolding users + their owned rows.
//
// Used to be needed because of a vite-proxy collision during E2E setup where
// registrations leaked into the dev Mongo. Kept around so anyone who points
// dev/staging at a real Mongo and runs Playwright by mistake can clean up
// the residue without surgery.
//
// Match rule: emails ending in `@example.com`. The test helpers
// (test/e2e/helpers.js, server/test/setup.js) all use `@example.com`, no real
// account ever should. If you DO have a real `@example.com` user, edit the
// match expression below before running.
//
// Usage:
//   node src/scripts/cleanup-test-users.js                  # dry run (default)
//   node src/scripts/cleanup-test-users.js --apply          # actually delete
//
// Deletes the User row plus every collection that has a `userId` ref.

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import ChatUsage from '../models/ChatUsage.js';
import ChatThread from '../models/ChatThread.js';
import FavoriteFood from '../models/FavoriteFood.js';
import Compound from '../models/Compound.js';
import DayNote from '../models/DayNote.js';
import Meal from '../models/Meal.js';
import FeatureRequest from '../models/FeatureRequest.js';
import PushSubscription from '../models/PushSubscription.js';
import DoseLog from '../models/DoseLog.js';
import MealProposal from '../models/MealProposal.js';
import Photo from '../models/Photo.js';
import SymptomLog from '../models/SymptomLog.js';
import FoodLog from '../models/FoodLog.js';
import RecentFood from '../models/RecentFood.js';
import SupportTicket from '../models/SupportTicket.js';
import WaistLog from '../models/WaistLog.js';
import UserSettings from '../models/UserSettings.js';
import Symptom from '../models/Symptom.js';
import WeightLog from '../models/WeightLog.js';

const TEST_EMAIL_RE = /@example\.com$/i;
const APPLY = process.argv.includes('--apply');

const OWNED_MODELS = [
  ChatUsage, ChatThread, FavoriteFood, Compound, DayNote, Meal, FeatureRequest,
  PushSubscription, DoseLog, MealProposal, Photo, SymptomLog, FoodLog,
  RecentFood, SupportTicket, WaistLog, UserSettings, Symptom, WeightLog,
];

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set — refusing to run.');
    process.exit(1);
  }
  console.log(`[cleanup] mode: ${APPLY ? 'APPLY (deleting)' : 'DRY RUN (use --apply to delete)'}`);
  console.log(`[cleanup] connecting to ${process.env.MONGODB_URI.replace(/\/\/[^@]+@/, '//***@')}`);
  await mongoose.connect(process.env.MONGODB_URI);

  const matches = await User.find({ email: { $regex: TEST_EMAIL_RE } }).select('_id email');
  console.log(`[cleanup] matched ${matches.length} test user(s)`);
  if (matches.length === 0) {
    await mongoose.disconnect();
    return;
  }

  // Show a sample so a misfire is obvious before --apply.
  for (const u of matches.slice(0, 5)) {
    console.log(`           ${u.email}  (${u._id})`);
  }
  if (matches.length > 5) console.log(`           …and ${matches.length - 5} more`);

  const userIds = matches.map((u) => u._id);

  // Count owned rows per collection.
  const ownedCounts = {};
  for (const Model of OWNED_MODELS) {
    ownedCounts[Model.modelName] = await Model.countDocuments({ userId: { $in: userIds } });
  }
  console.log('[cleanup] owned rows:');
  for (const [name, count] of Object.entries(ownedCounts)) {
    if (count > 0) console.log(`           ${name}: ${count}`);
  }

  if (!APPLY) {
    console.log('[cleanup] dry run — no changes. Re-run with --apply.');
    await mongoose.disconnect();
    return;
  }

  for (const Model of OWNED_MODELS) {
    const r = await Model.deleteMany({ userId: { $in: userIds } });
    if (r.deletedCount > 0) {
      console.log(`[cleanup] ${Model.modelName}: deleted ${r.deletedCount}`);
    }
  }
  const userResult = await User.deleteMany({ _id: { $in: userIds } });
  console.log(`[cleanup] User: deleted ${userResult.deletedCount}`);

  await mongoose.disconnect();
  console.log('[cleanup] done.');
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
