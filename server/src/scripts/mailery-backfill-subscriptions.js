// Backfill mailer_subscriptions rows for all existing real users.
//
// Run once after deploying the Mailery integration so users created before
// the User.post('save') auto-subscribe hook landed are still reachable by
// flows. Idempotent — `mailer.upsertSubscription` upserts.
//
// Usage:
//   node src/scripts/mailery-backfill-subscriptions.js [--dry-run] [--batch=500]
//
// Excludes sandbox + template users (not real contacts).

import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { startMailery, stopMailery, upsertSubscription, isMaileryDisabled } from '../services/mailery.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('mailery-backfill');

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));

const dryRun = !!args.get('dry-run');
const batchSize = Number(args.get('batch') || 500);

async function main() {
  if (!process.env.MONGODB_URI) {
    log.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  log.info('mongo connected');
  await startMailery();
  if (isMaileryDisabled()) {
    log.error('mailery is disabled — backfill aborted');
    await mongoose.disconnect();
    process.exit(1);
  }

  const filter = {
    isDemoSandbox: { $ne: true },
    isDemoTemplate: { $ne: true },
    email: { $exists: true, $ne: null },
  };
  const total = await User.countDocuments(filter);
  log.info({ total, dryRun, batchSize }, 'backfill begin');

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const cursor = User.find(filter).select('_id email').lean().cursor();
  for await (const user of cursor) {
    processed += 1;
    if (dryRun) {
      succeeded += 1;
    } else {
      try {
        await upsertSubscription(user._id, 'backfill');
        succeeded += 1;
      } catch (err) {
        failed += 1;
        log.warn({ ...errContext(err), userId: String(user._id) }, 'backfill: upsert failed');
      }
    }
    if (processed % batchSize === 0) {
      log.info({ processed, succeeded, failed }, 'backfill progress');
    }
  }

  log.info({ processed, succeeded, failed, dryRun }, 'backfill complete');

  await stopMailery();
  await mongoose.disconnect();
}

main().catch((err) => {
  log.fatal(errContext(err), 'backfill failed');
  process.exit(1);
});
