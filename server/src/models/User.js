import mongoose from 'mongoose';
import { DEFAULT_PLAN_ID } from '../../../shared/plans.js';
import { stripe, isStripeConfigured } from '../services/stripe.js';
import { S3_CONFIGURED, deleteObject } from '../services/s3.js';
import { childLogger, errContext } from '../lib/logger.js';

const cascadeLog = childLogger('user.cascade');

// Every collection that hangs off `userId`. Drives the cascade-delete hook
// below. Adding a new model with a `userId` ref means adding it here, or
// orphaned rows will accumulate after account/sandbox deletion.
//
// Exported so the cascade test imports the same list rather than mirroring
// it manually — drift in either direction (added or removed) surfaces as
// a test failure instead of silently ignored coverage.
export const CASCADE_COLLECTIONS = [
  'ChatThread', 'ChatUsage', 'Compound', 'DayNote', 'DoseLog',
  'FastingEvent', 'FavoriteFood', 'FeatureRequest', 'FoodItem', 'FoodLog',
  'FunnelEvent', 'Meal', 'MealProposal', 'Metric', 'MetricLog', 'Photo', 'PhotoType', 'PushSubscription',
  'RecentFood', 'Symptom', 'SymptomLog', 'SupportTicket',
  'UserSettings', 'WeightLog',
];

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  // Optional: users created via OAuth (e.g. Google) have no password.
  passwordHash: { type: String, default: null },
  passwordResetTokenHash: { type: String, default: null },
  passwordResetExpiresAt: { type: Date, default: null },

  // OAuth identifier. No default — a unique+sparse index treats `null` as a
  // value, so users without googleId must omit the field entirely (otherwise
  // the second password-only registration collides on the duplicate null).
  googleId: { type: String },
  // Apple Sign-In subject (`sub`). Stable per (user, Apple team), never
  // recycled. Same sparse-unique pattern as googleId — omit the field
  // entirely when absent so multiple non-Apple users don't collide on null.
  appleId: { type: String },
  avatarUrl: { type: String, default: null },

  // Subscription plan. References a plan id from shared/plans.js.
  plan: { type: String, default: DEFAULT_PLAN_ID, index: true },
  planActivatedAt: { type: Date, default: null },
  // null = no expiry (free tier or ongoing sub). Set on cancel to end of period.
  planExpiresAt: { type: Date, default: null },

  // Stripe linkage. Populated on first checkout; persists across sub changes.
  stripeCustomerId: { type: String, default: null, index: true },
  stripeSubscriptionId: { type: String, default: null },

  // Admin-assigned per-user overrides merged atop plan limits. Shape mirrors
  // Plan.chat / Plan.storage. Example: { chat: { costUsdPerDay: 5 } }.
  limitsOverride: { type: mongoose.Schema.Types.Mixed, default: null },

  // Lifetime counter for food-image recognition calls. Drives the Free-tier
  // teaser cap (3 photos total, ever) which is checked in requireChatQuota.
  // Paid tiers use a per-day cap enforced against ChatUsage aggregates.
  imageRecognitionCount: { type: Number, default: 0 },

  isAdmin: { type: Boolean, default: false },

  // Optional public display name shown on feature-request comments.
  // Falls back to email local-part when absent.
  displayName: { type: String, default: null, trim: true, maxlength: 60 },

  // Tracks whether the post-signup wizard has been completed. Until true,
  // the client redirects authed routes to /welcome. `onboardingStep` lets a
  // user resume mid-wizard if they bail.
  onboardingComplete: { type: Boolean, default: false },
  onboardingStep: { type: String, default: 'basics' },

  // Demo mode. The canonical template is exactly one row with
  // `isDemoTemplate: true`; all reads against it are allowed but writes are
  // rejected by the pre-save hook below. Sandboxes are ephemeral clones;
  // anonymous sandboxes have parentUserId null, authed sandboxes parent to
  // the real user. lastActiveAt drives the cleanup cron.
  //
  // activeProfileId on a real user record persists their demo toggle: null
  // means "viewing my real data" (default), set means "viewing sandbox X."
  // Per-request, requireAuth resolves this into req.userId (data scope)
  // while req.authUserId stays bound to the real user for auth/billing/push.
  isDemoTemplate: { type: Boolean, default: false },
  isDemoSandbox: { type: Boolean, default: false },
  parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lastActiveAt: { type: Date, default: null },
  activeProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Warm-pool flag. A pooled sandbox is fully cloned from the template but
  // not yet attached to any session — the next anon /start call claims one
  // atomically (findOneAndUpdate flips this to false). The cleanup job
  // ignores pooled sandboxes; the refill job keeps the count >= target.
  isPooled: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
});

// Defense-in-depth: even if a route accidentally serializes a raw User doc
// (e.g. `res.json({ user: req.user })`), bcrypt hash + reset token never
// reach the wire. The whitelist serializeUser() in routes/auth.js is the
// primary guard; this is the safety net.
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpiresAt;
    return ret;
  },
});

userSchema.index({ passwordResetTokenHash: 1 });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ appleId: 1 }, { unique: true, sparse: true });
userSchema.index({ isDemoSandbox: 1, lastActiveAt: 1 });
userSchema.index({ parentUserId: 1 });
// Pool claim hits this constantly — partial index keeps it tiny (N rows).
userSchema.index(
  { isPooled: 1 },
  { partialFilterExpression: { isPooled: true } },
);
// At most one row may carry isDemoTemplate=true.
userSchema.index(
  { isDemoTemplate: 1 },
  { unique: true, partialFilterExpression: { isDemoTemplate: true } },
);

// Belt-and-suspenders write guard: any save (insert or update) targeting the
// canonical template is rejected. Reads are unrestricted. Catches stray
// writes that bypass the application-layer guard. Initial transition that
// flips a fresh row to template via the seeding script is allowed (isNew).
userSchema.pre('save', async function preventTemplateMutation() {
  if (this.isDemoTemplate && !this.isNew) {
    throw new Error('Demo template is read-only');
  }
});

async function preventTemplateUpdate() {
  const update = this.getUpdate() || {};
  const filter = this.getFilter() || {};
  if (filter.isDemoTemplate === true) {
    throw new Error('Demo template is read-only');
  }
  // Promoting an existing row to template via update is blocked; seeding
  // must insert a new doc. Cover $set, $setOnInsert (upsert path), and the
  // bare update form.
  const setClause = update.$set || update;
  const setOnInsertClause = update.$setOnInsert;
  if (
    (setClause && setClause.isDemoTemplate === true)
    || (setOnInsertClause && setOnInsertClause.isDemoTemplate === true)
  ) {
    throw new Error('Cannot promote existing row to demo template; insert a new row');
  }
}

userSchema.pre('updateOne', preventTemplateUpdate);
userSchema.pre('updateMany', preventTemplateUpdate);
userSchema.pre('findOneAndUpdate', preventTemplateUpdate);

// Cascade delete. Fires only on document-level `doc.deleteOne()` and
// `findOneAndDelete` (see hook below); query-level `User.deleteMany({})` is
// intentionally left alone so test setups can wipe the collection without
// paying the cascade per row. All production user deletions must route
// through `services/userDeletion.deleteUser()` or `doc.deleteOne()` — see
// docs/testing.md.
//
// Order matters: capture S3 keys before deleting Mongo rows that hold them.
// If any step fails, the User row stays (the actual delete runs after all
// pre hooks resolve), so a re-run is idempotent — every downstream operation
// is safe to retry.
userSchema.pre('deleteOne', { document: true, query: false }, async function cascadeDelete() {
  const User = mongoose.model('User');
  const userId = this._id;
  const ctx = { userId: String(userId), email: this.email };

  try {
    // 1. Recursively delete child sandboxes (parentUserId → this user).
    // Only sandbox children are valid here; a non-sandbox parented row would
    // indicate data corruption (and could form a cycle), so refuse to recurse.
    const sandboxes = await User.find({ parentUserId: userId, isDemoSandbox: true });
    for (const sb of sandboxes) {
      await sb.deleteOne();
    }

    // 2. Capture S3 keys BEFORE deleting rows so we know what to clean up.
    let s3Keys = [];
    if (S3_CONFIGURED) {
      const Photo = mongoose.model('Photo');
      const SupportTicket = mongoose.model('SupportTicket');
      const [photos, tickets] = await Promise.all([
        Photo.find({ userId }).select('s3Key').lean(),
        SupportTicket.find({ userId }).select('attachments messages.attachments').lean(),
      ]);
      s3Keys = [
        ...photos.map((p) => p.s3Key),
        ...tickets.flatMap((t) => [
          ...(t.attachments || []),
          ...((t.messages || []).flatMap((m) => m.attachments || [])),
        ].map((a) => a.s3Key)),
      ].filter(Boolean);
    }

    // 3. Stripe customer deletion runs BEFORE Mongo wipes. If Stripe errors
    //    non-recoverably (e.g. rate_limit, network), the throw aborts the
    //    cascade — the User row and every owned collection are preserved so
    //    the caller can retry cleanly. Putting Stripe last would mean a
    //    Stripe failure leaves the user retryable but the owned data already
    //    wiped — unrecoverable. `resource_missing` is treated as already-gone.
    let stripeCleared = false;
    if (this.stripeCustomerId && isStripeConfigured()) {
      try {
        await stripe.customers.del(this.stripeCustomerId);
        stripeCleared = true;
      } catch (err) {
        if (err?.code === 'resource_missing') {
          cascadeLog.info({ ...ctx, stripeCustomerId: this.stripeCustomerId }, 'Stripe customer already gone');
          stripeCleared = true;
        } else {
          throw err;
        }
      }
    }

    // 4. Cascade Mongoose collections in parallel.
    const counts = await Promise.all(
      CASCADE_COLLECTIONS.map(async (name) => {
        const Model = mongoose.model(name);
        const r = await Model.deleteMany({ userId });
        return [name, r.deletedCount || 0];
      }),
    );
    const totalRows = counts.reduce((sum, [, n]) => sum + n, 0);

    // 5. Best-effort S3 object cleanup. Failures here log but don't block
    //    user deletion — orphaned S3 objects are a janitor problem, not a
    //    correctness problem.
    let s3Deleted = 0;
    let s3Failed = 0;
    for (const key of s3Keys) {
      try {
        await deleteObject(key);
        s3Deleted += 1;
      } catch (err) {
        s3Failed += 1;
        cascadeLog.warn({ ...ctx, key, ...errContext(err) }, 'S3 cleanup failed for key');
      }
    }

    cascadeLog.info(
      {
        ...ctx,
        sandboxes: sandboxes.length,
        mongoRows: totalRows,
        byCollection: Object.fromEntries(counts),
        s3Deleted,
        s3Failed,
        stripeCleared,
      },
      'user cascade complete',
    );
  } catch (err) {
    cascadeLog.error({ ...ctx, ...errContext(err) }, 'user cascade failed');
    throw err;
  }
});

// Mirror the cascade onto findOneAndDelete / findByIdAndDelete. Mongoose
// treats those as a separate hook surface; without this, those code paths
// would skip the cascade. We load the doc and call doc.deleteOne() (which
// fires the doc-level hook above) — the original query then runs as a
// harmless no-op since the row is already gone.
userSchema.pre('findOneAndDelete', async function cascadeFromQuery() {
  const doc = await this.model.findOne(this.getFilter());
  if (doc) await doc.deleteOne();
});

export default mongoose.model('User', userSchema);
