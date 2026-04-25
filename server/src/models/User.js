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

  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ passwordResetTokenHash: 1 });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

export default mongoose.model('User', userSchema);
