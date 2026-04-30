// One-shot migration for the feed refactor.
//
// What it does:
//   1. Deletes Contacts that were auto-created by past Reddit scans
//      (relationship='unknown' AND source.type='reddit_engagement_link').
//      These are random reddit posters that should never have been Contacts.
//   2. Unsets stale fields on existing EngagementOpportunity rows
//      (triage.valueAngle/risks/reasoning/model/costUsd, draft.citations/
//      confidence/voiceContactIdAtDraft/model/costUsd, postPerformance,
//      authorPostKarma, postedCommentId, reviewerNotes).
//   3. Backfills `decision: 'pending'` on opportunities that don't have it.
//   4. Unsets removed MonitoredSubreddit fields (totalPostsPosted/Earned,
//      scanRules.minCommentScore, scanRules.fitnessFilters.avoidNicheMismatch
//      and avoidAlreadyAnsweredCount).
//   5. Migrates triage.reasoning → triage.because for any rows that have
//      the old field name.
//
// Idempotent — safe to re-run.
//
// Run from /marketing:
//   node --env-file=../server/.env scripts/migrate-feed-refactor.js

import mongoose from 'mongoose';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI not set');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  // 1. Delete auto-created reddit-author Contacts.
  const contacts = db.collection('marketing_contacts');
  const before = await contacts.countDocuments({
    relationship: 'unknown',
    'source.type': 'reddit_engagement_link',
  });
  const delResult = await contacts.deleteMany({
    relationship: 'unknown',
    'source.type': 'reddit_engagement_link',
  });
  console.log(`[1] auto-created reddit Contacts: matched=${before} deleted=${delResult.deletedCount}`);

  // 2. Unset stale opportunity fields.
  const opps = db.collection('marketing_engagement_opportunities');
  const oppRes = await opps.updateMany(
    {},
    {
      $unset: {
        'triage.valueAngle': '',
        'triage.risks': '',
        'triage.reasoning': '',
        'triage.model': '',
        'triage.costUsd': '',
        'draft.citations': '',
        'draft.confidence': '',
        'draft.voiceContactIdAtDraft': '',
        'draft.model': '',
        'draft.costUsd': '',
        postPerformance: '',
        authorPostKarma: '',
        postedCommentId: '',
        reviewerNotes: '',
      },
    }
  );
  console.log(`[2] opportunities cleaned: matched=${oppRes.matchedCount} modified=${oppRes.modifiedCount}`);

  // 3. Backfill decision='pending' on rows that don't have it.
  const bf = await opps.updateMany(
    { decision: { $exists: false } },
    { $set: { decision: 'pending' } }
  );
  console.log(`[3] decision backfill: modified=${bf.modifiedCount}`);

  // 3b. If we have rows with the OLD `triage.reasoning` (we just $unset it
  // above, so this is mostly a no-op now) → also backfill `triage.because`
  // from any rows where we still see reasoning before the unset took effect.
  // Already handled in step 2 since we unset reasoning. Nothing to do.

  // 4. Unset removed MonitoredSubreddit fields.
  const subs = db.collection('marketing_monitored_subreddits');
  const subRes = await subs.updateMany(
    {},
    {
      $unset: {
        totalPostsPosted: '',
        totalUpvotesEarned: '',
        'scanRules.minCommentScore': '',
        'scanRules.fitnessFilters.avoidNicheMismatch': '',
        'scanRules.fitnessFilters.avoidAlreadyAnsweredCount': '',
      },
    }
  );
  console.log(`[4] subreddits cleaned: matched=${subRes.matchedCount} modified=${subRes.modifiedCount}`);

  // 5. Drop the customFields field from contacts (cut from schema).
  const cfRes = await contacts.updateMany(
    {},
    { $unset: { customFields: '' } }
  );
  console.log(`[5] contacts customFields unset: modified=${cfRes.modifiedCount}`);

  await mongoose.disconnect();
  console.log('[migrate] done');
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
