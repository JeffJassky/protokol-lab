import mongoose from 'mongoose';

// One row per logged workout. `exerciseId` references the user's catalog;
// `engineClass` is denormalized so the simulation pipeline (Phase 2) can
// build TimelineItems without an extra join. `caloriesBurned` is computed
// at save time from MET × weight × duration × intensity, but kept on the
// row so wearable overrides + retroactive MET-table updates don't rewrite
// history. Detailed metadata (sets/reps/weight or distance/pace) is
// optional and display-only — engine ignores it for v1.
const exerciseLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    exerciseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise', default: null },
    // Display label captured at log time so deleting an Exercise catalog
    // entry doesn't orphan the row's name. Required even when exerciseId
    // is set; updated to match the catalog on edit.
    label: { type: String, required: true, trim: true },
    engineClass: {
      type: String,
      enum: ['exercise_cardio', 'exercise_resistance', 'exercise_hiit', 'exercise_recovery'],
      required: true,
    },
    date: { type: Date, required: true },
    durationMin: { type: Number, required: true, min: 1 },
    intensity: { type: Number, default: 1.0, min: 0.5, max: 1.5 },
    caloriesBurned: { type: Number, default: 0, min: 0 },
    // Detailed metadata — present when the user logged in "Detailed" mode.
    distanceKm: { type: Number, default: null },
    sets: { type: Number, default: null },
    reps: { type: Number, default: null },
    weightKg: { type: Number, default: null },
    notes: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
);

exerciseLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('ExerciseLog', exerciseLogSchema);
