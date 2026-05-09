import mongoose from 'mongoose';

// Push subscription. Discriminated by `transport`:
//
//   'web' (default)  — Web Push via VAPID. `endpoint` is the push service
//                      URL; `keys.p256dh` + `keys.auth` are the encryption
//                      keys. Sent via the `web-push` library.
//   'fcm'            — Firebase Cloud Messaging (Android native). `token`
//                      holds the device registration token; Web Push fields
//                      are unused. Sent via firebase-admin.
//   'apns'           — Apple Push Notification service (iOS native).
//                      `token` holds the device token. Sent via @parse/node-apn
//                      or apn lib + .p8 key from Apple. Phase C.
//
// One document per (user, transport, endpoint-or-token) so the same
// device can re-subscribe after re-login without duplicates. The
// (user, endpoint) unique index keeps web behavior unchanged; native
// subs synthesize a stable endpoint string from `${transport}:${token}`.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    transport: { type: String, enum: ['web', 'fcm', 'apns'], default: 'web', index: true },
    endpoint: { type: String, required: true },
    // Web Push keys. Required for transport=web; ignored otherwise.
    keys: {
      p256dh: { type: String },
      auth: { type: String },
    },
    // Native push token. Required for transport=fcm or transport=apns;
    // ignored for transport=web.
    token: { type: String, default: null },
    userAgent: { type: String, default: '' },
    categories: {
      // Opt-out per category. Missing entry = enabled (new categories
      // default-on so reminders don't silently disappear after an update).
      doseReminder: { type: Boolean, default: true },
      trackReminder: { type: Boolean, default: true },
      menstruationReminder: { type: Boolean, default: true },
      fastingReminder: { type: Boolean, default: true },
      test: { type: Boolean, default: true },
    },
    lastSentAt: { type: Date },
    lastError: { type: String },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export default mongoose.model('PushSubscription', pushSubscriptionSchema);
