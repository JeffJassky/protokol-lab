import mongoose from 'mongoose';

// One document per (user, device/browser). Endpoints are globally unique
// per Push Service, so we key off (userId, endpoint) to allow the same
// browser to re-subscribe after re-login without duplicates.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '' },
    categories: {
      // Opt-out per category. Missing entry = enabled (new categories
      // default-on so reminders don't silently disappear after an update).
      doseReminder: { type: Boolean, default: true },
      trackReminder: { type: Boolean, default: true },
      test: { type: Boolean, default: true },
    },
    lastSentAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export default mongoose.model('PushSubscription', pushSubscriptionSchema);
