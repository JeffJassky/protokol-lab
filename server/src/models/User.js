import mongoose from 'mongoose';
import { DEFAULT_PLAN_ID } from '../../../shared/plans.js';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  passwordResetTokenHash: { type: String, default: null },
  passwordResetExpiresAt: { type: Date, default: null },

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

  isAdmin: { type: Boolean, default: false },

  // Optional public display name shown on feature-request comments.
  // Falls back to email local-part when absent.
  displayName: { type: String, default: null, trim: true, maxlength: 60 },

  createdAt: { type: Date, default: Date.now },
});

userSchema.index({ passwordResetTokenHash: 1 });

export default mongoose.model('User', userSchema);
