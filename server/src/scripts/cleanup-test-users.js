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
// Register every model so the User cascade hook can resolve children by name.
import '../models/index.js';
import User from '../models/User.js';
import { deleteUser } from '../services/userDeletion.js';

const TEST_EMAIL_RE = /@example\.com$/i;
const APPLY = process.argv.includes('--apply');

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

  if (!APPLY) {
    console.log('[cleanup] dry run — no changes. Re-run with --apply.');
    console.log('[cleanup] (per-collection counts skipped — User cascade hook handles all owned rows)');
    await mongoose.disconnect();
    return;
  }

  // Use deleteUser() so the User cascade hook clears every userId-referencing
  // collection plus Stripe + S3 attachments. One call per user.
  let deleted = 0;
  for (const u of matches) {
    await deleteUser(u._id);
    deleted += 1;
  }
  console.log(`[cleanup] User: deleted ${deleted} (cascade handled owned rows)`);

  await mongoose.disconnect();
  console.log('[cleanup] done.');
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
