// One-shot: bring legacy demo sandboxes (built before plan/unlimited shipped)
// up to the current shape. Idempotent — re-running is a no-op.

import dotenv from 'dotenv';
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });

import mongoose from 'mongoose';
import User from '../models/User.js';

await mongoose.connect(process.env.MONGODB_URI);

const before = await User.countDocuments({
  isDemoSandbox: true,
  $or: [{ plan: { $ne: 'unlimited' } }, { onboardingComplete: { $ne: true } }],
});

const r = await User.updateMany(
  { isDemoSandbox: true },
  { $set: { plan: 'unlimited', onboardingComplete: true } },
);

console.log(`Sandboxes needing update before: ${before}`);
console.log(`updateMany result: matched=${r.matchedCount} modified=${r.modifiedCount}`);

await mongoose.disconnect();
