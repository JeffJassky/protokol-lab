// Seeds (or refreshes) the Apple App Store / Google Play reviewer test
// account so submission forms can ship a working credential pair.
//
// Apple guideline 2.1 expects a fully-functional demo path. An empty account
// with a barren dashboard reads as "minimum functionality" — see
// plans/native-app-plan.md M5 / M17. This script provisions:
//
//   - A real password account (so the reviewer can sign in via the email
//     form, native Google, or native Apple — all paths work).
//   - Pro plan active so the reviewer sees gated features (chat, image
//     recognition, etc) without paywalls.
//   - 4 weeks of realistic daily food logs, weekly weight entries, weekly
//     waist entries, and one tirzepatide compound with a dose every 7 days.
//   - One brief chat thread so /chat doesn't render as empty.
//
// Idempotent: re-run wipes the seeded data and reseeds. Safe in CI.
//
// Usage:
//   REVIEWER_PASSWORD='your-locked-password' node server/src/scripts/seed-reviewer-account.js
//
// REVIEWER_EMAIL defaults to appstore-review@protokollab.com. REVIEWER_PASSWORD
// is required — pick a strong password and store it in 1Password / the App
// Store Connect submission form. Re-running with a different password
// rotates the credential without disturbing the seeded data set.

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import FoodItem from '../models/FoodItem.js';
import FoodLog from '../models/FoodLog.js';
import WeightLog from '../models/WeightLog.js';
import WaistLog from '../models/WaistLog.js';
import Compound from '../models/Compound.js';
import DoseLog from '../models/DoseLog.js';
import ChatThread from '../models/ChatThread.js';

const REVIEWER_EMAIL = (process.env.REVIEWER_EMAIL || 'appstore-review@protokollab.com')
  .toLowerCase()
  .trim();
const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD;

if (!REVIEWER_PASSWORD) {
  console.error(
    'REVIEWER_PASSWORD env var required. Pick a strong password and stash it in\n' +
    '1Password — same value goes in App Store Connect / Play Console submission.\n\n' +
    'Example:\n' +
    "  REVIEWER_PASSWORD='your-locked-password' node server/src/scripts/seed-reviewer-account.js\n",
  );
  process.exit(1);
}
if (REVIEWER_PASSWORD.length < 12) {
  console.error('REVIEWER_PASSWORD must be at least 12 characters.');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

// 1. Upsert the user with a fresh password hash + pro plan active.
const passwordHash = await bcrypt.hash(REVIEWER_PASSWORD, 10);
const user = await User.findOneAndUpdate(
  { email: REVIEWER_EMAIL },
  {
    $set: {
      email: REVIEWER_EMAIL,
      passwordHash,
      displayName: 'App Store Reviewer',
      plan: 'unlimited',
      planActivatedAt: new Date(),
      planExpiresAt: null,
      onboardingComplete: true,
      onboardingStep: 'done',
    },
  },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);
console.log(`[reviewer] user upserted: ${user.email} (${user._id})`);

const userId = user._id;

// 2. Wipe prior seeded data for this user so re-runs don't pile up duplicates.
//    Stable seed: regenerate from scratch every run.
await Promise.all([
  FoodLog.deleteMany({ userId }),
  WeightLog.deleteMany({ userId }),
  WaistLog.deleteMany({ userId }),
  DoseLog.deleteMany({ userId }),
  Compound.deleteMany({ userId }),
  ChatThread.deleteMany({ userId }),
  FoodItem.deleteMany({ userId, name: { $in: SEED_FOOD_NAMES() } }),
]);

// 3. Seed a small foundation of foods, then 4 weeks of meals.
const foods = await FoodItem.insertMany([
  { userId, name: 'Greek Yogurt (plain, 0%)', emoji: '🥣', brand: 'Fage', servingSize: '170 g', servingGrams: 170, caloriesPer: 100, proteinPer: 18, fatPer: 0, carbsPer: 6 },
  { userId, name: 'Chicken Breast (grilled)', emoji: '🍗', servingSize: '100 g', servingGrams: 100, caloriesPer: 165, proteinPer: 31, fatPer: 3.6, carbsPer: 0 },
  { userId, name: 'White Rice (cooked)', emoji: '🍚', servingSize: '1 cup', servingGrams: 158, caloriesPer: 205, proteinPer: 4.3, fatPer: 0.4, carbsPer: 45 },
  { userId, name: 'Salmon (baked)', emoji: '🐟', servingSize: '150 g', servingGrams: 150, caloriesPer: 312, proteinPer: 33, fatPer: 19, carbsPer: 0 },
  { userId, name: 'Mixed Greens Salad', emoji: '🥗', servingSize: '2 cups', servingGrams: 100, caloriesPer: 50, proteinPer: 2, fatPer: 0.5, carbsPer: 10 },
  { userId, name: 'Apple', emoji: '🍎', servingSize: '1 medium', servingGrams: 182, caloriesPer: 95, proteinPer: 0.5, fatPer: 0.3, carbsPer: 25 },
  { userId, name: 'Almonds', emoji: '🌰', servingSize: '28 g', servingGrams: 28, caloriesPer: 164, proteinPer: 6, fatPer: 14, carbsPer: 6 },
  { userId, name: 'Eggs (whole)', emoji: '🥚', servingSize: '2 large', servingGrams: 100, caloriesPer: 155, proteinPer: 13, fatPer: 11, carbsPer: 1 },
]);
const byName = Object.fromEntries(foods.map((f) => [f.name, f]));

const today = new Date();
today.setHours(0, 0, 0, 0);
const DAYS = 28;

const dayMs = 24 * 60 * 60 * 1000;
function dateNDaysAgo(n, hours = 0) {
  const d = new Date(today.getTime() - n * dayMs);
  d.setHours(hours, 0, 0, 0);
  return d;
}

const foodLogs = [];
for (let n = DAYS - 1; n >= 0; n--) {
  // Breakfast
  foodLogs.push({ userId, foodItemId: byName['Greek Yogurt (plain, 0%)']._id, date: dateNDaysAgo(n, 8), mealType: 'breakfast', servingCount: 1 });
  foodLogs.push({ userId, foodItemId: byName['Eggs (whole)']._id, date: dateNDaysAgo(n, 8), mealType: 'breakfast', servingCount: 1 });
  // Lunch
  foodLogs.push({ userId, foodItemId: byName['Chicken Breast (grilled)']._id, date: dateNDaysAgo(n, 13), mealType: 'lunch', servingCount: 1.5 });
  foodLogs.push({ userId, foodItemId: byName['Mixed Greens Salad']._id, date: dateNDaysAgo(n, 13), mealType: 'lunch', servingCount: 1 });
  // Snack
  if (n % 2 === 0) {
    foodLogs.push({ userId, foodItemId: byName['Almonds']._id, date: dateNDaysAgo(n, 15), mealType: 'snack', servingCount: 1 });
  } else {
    foodLogs.push({ userId, foodItemId: byName['Apple']._id, date: dateNDaysAgo(n, 15), mealType: 'snack', servingCount: 1 });
  }
  // Dinner
  if (n % 3 === 0) {
    foodLogs.push({ userId, foodItemId: byName['Salmon (baked)']._id, date: dateNDaysAgo(n, 19), mealType: 'dinner', servingCount: 1 });
  } else {
    foodLogs.push({ userId, foodItemId: byName['Chicken Breast (grilled)']._id, date: dateNDaysAgo(n, 19), mealType: 'dinner', servingCount: 1.5 });
  }
  foodLogs.push({ userId, foodItemId: byName['White Rice (cooked)']._id, date: dateNDaysAgo(n, 19), mealType: 'dinner', servingCount: 1 });
}
await FoodLog.insertMany(foodLogs);
console.log(`[reviewer] inserted ${foodLogs.length} food logs across ${DAYS} days`);

// 4. Weight + waist trend (gentle downward — narrative is "tracking a cut").
const weightLogs = [];
const waistLogs = [];
const startWeight = 192;
for (let n = DAYS - 1; n >= 0; n -= 2) {
  // Daily-ish weighings with realistic noise + monotone trend.
  const delta = ((DAYS - n) / DAYS) * -7; // -7 lbs over the window
  const noise = (n % 5) * 0.3 - 0.6;
  weightLogs.push({ userId, weightLbs: Number((startWeight + delta + noise).toFixed(1)), date: dateNDaysAgo(n, 7) });
}
for (let n = DAYS - 1; n >= 0; n -= 7) {
  // Weekly waist tape measurement.
  const delta = ((DAYS - n) / DAYS) * -2;
  waistLogs.push({ userId, waistInches: Number((36 + delta).toFixed(1)), date: dateNDaysAgo(n, 7) });
}
await WeightLog.insertMany(weightLogs);
await WaistLog.insertMany(waistLogs);
console.log(`[reviewer] inserted ${weightLogs.length} weight + ${waistLogs.length} waist entries`);

// 5. One compound + 4 doses (weekly tirzepatide).
const compound = await Compound.create({
  userId,
  name: 'Tirzepatide',
  brandNames: ['Mounjaro', 'Zepbound'],
  isSystem: false,
  enabled: true,
  halfLifeDays: 5,
  intervalDays: 7,
  kineticsShape: 'subq',
  doseUnit: 'mg',
  color: '#7c3aed',
  order: 0,
  reminderEnabled: true,
  reminderTime: '09:00',
});
const doseLogs = [];
for (let n = DAYS - 1; n >= 0; n -= 7) {
  doseLogs.push({ userId, compoundId: compound._id, value: 5, date: dateNDaysAgo(n, 9) });
}
await DoseLog.insertMany(doseLogs);
console.log(`[reviewer] inserted ${doseLogs.length} dose logs for ${compound.name}`);

// 6. One brief chat thread so /chat doesn't render as empty for the reviewer.
await ChatThread.create({
  userId,
  title: 'Macros for cut week 4',
  messages: [
    { role: 'user', text: 'How am I tracking against my protein target this week?', createdAt: dateNDaysAgo(1, 14) },
    { role: 'assistant', text: 'Based on your last 7 days of food logs you averaged 152 g protein/day against a 160 g target. Slightly under — easiest fix is a second yogurt or extra serving of chicken at lunch.', createdAt: dateNDaysAgo(1, 14) },
  ],
});
console.log('[reviewer] inserted seed chat thread');

console.log(`\n[reviewer] DONE. Reviewer account ready:\n  email:    ${REVIEWER_EMAIL}\n  password: (the value you passed in REVIEWER_PASSWORD)\n  plan:     unlimited\n  data:     ${DAYS} days of foodlog, ${weightLogs.length} weights, ${waistLogs.length} waist, ${doseLogs.length} doses, 1 chat thread\n`);

await mongoose.disconnect();

// Names whose FoodItems we wipe on each run so the seeder is idempotent.
function SEED_FOOD_NAMES() {
  return [
    'Greek Yogurt (plain, 0%)',
    'Chicken Breast (grilled)',
    'White Rice (cooked)',
    'Salmon (baked)',
    'Mixed Greens Salad',
    'Apple',
    'Almonds',
    'Eggs (whole)',
  ];
}
