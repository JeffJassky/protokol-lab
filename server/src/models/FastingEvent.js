import mongoose from 'mongoose';

// One row per actual or scheduled fasting occurrence.
//
// `source` distinguishes the origin:
//   - 'scheduled'    — materialized from UserSettings.fasting.weeklyRules / daily
//   - 'one_off'      — user-created single fast (specific datetimes)
//   - 'manual_start' — user tapped "Start fast" without a planned schedule
//
// `actualStartAt` / `actualEndAt` are null until the user (or auto-detect)
// transitions the event. The banner treats `actualStartAt && !actualEndAt`
// as "active." `plannedEndAt` becomes the goal line.
const fastingEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  source: {
    type: String,
    enum: ['scheduled', 'one_off', 'manual_start'],
    required: true,
  },
  plannedStartAt: { type: Date, required: true },
  plannedEndAt: { type: Date, required: true },
  actualStartAt: { type: Date, default: null },
  actualEndAt: { type: Date, default: null },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Quick lookups for "active fast for user" and "upcoming fasts in range".
fastingEventSchema.index({ userId: 1, actualStartAt: 1, actualEndAt: 1 });
fastingEventSchema.index({ userId: 1, plannedStartAt: 1 });

fastingEventSchema.pre('save', function () {
  this.updatedAt = new Date();
});

export default mongoose.model('FastingEvent', fastingEventSchema);
