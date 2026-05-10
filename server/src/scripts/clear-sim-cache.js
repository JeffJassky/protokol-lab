#!/usr/bin/env node
//
// Nuke the persisted sim checkpoint for every user (or one if
// --user-id=<id>). Pairs with a server restart to fully invalidate
// the sim cache: the in-memory `responseCache` Map only lives in the
// server process and gets cleared on restart; the checkpoint
// (`UserSettings.latestSimCheckpoint`) is in Mongo and persists across
// restarts, so we wipe it explicitly here.
//
// Use after a script that wrote directly to FoodLog / DoseLog /
// ExerciseLog (bypassing route invalidation hooks).
//
// Usage:
//   node src/scripts/clear-sim-cache.js [--user-id=<id>]

import 'dotenv/config';
import mongoose from 'mongoose';
import UserSettings from '../models/UserSettings.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('clear-sim-cache');

export async function clearSimCheckpoints({ userId = null } = {}) {
  const filter = userId
    ? { userId: new mongoose.Types.ObjectId(userId) }
    : {};
  const result = await UserSettings.updateMany(filter, {
    $set: {
      'latestSimCheckpoint.date': null,
      'latestSimCheckpoint.endState': null,
      'latestSimCheckpoint.computedAt': null,
      'latestSimCheckpoint.schemaVersion': 0,
      'latestSimCheckpoint.inputsThroughDate': null,
    },
  });
  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    log.error('MONGODB_URI not set — aborting');
    process.exit(1);
  }
  const userArg = process.argv.find((a) => a.startsWith('--user-id='));
  const userId = userArg ? userArg.split('=')[1] : null;
  try {
    await mongoose.connect(uri);
    const stats = await clearSimCheckpoints({ userId });
    log.info(stats, 'sim checkpoints cleared');
    log.info('IMPORTANT: restart the server to flush in-memory responseCache too');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    log.error(errContext(err), 'CLI failed');
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}
