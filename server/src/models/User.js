import mongoose from 'mongoose';
import { DEFAULT_PLAN_ID } from '../../../shared/plans.js';

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

userSchema.index({ passwordResetTokenHash: 1 });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
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

export default mongoose.model('User', userSchema);
