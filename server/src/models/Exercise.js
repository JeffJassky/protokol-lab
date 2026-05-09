import mongoose from 'mongoose';

// Exercise catalog. Mirrors the Compound model — a per-user list of
// activities the log/dashboard pickers know about. System-seeded entries
// (isSystem=true) cover the common 25-or-so cases; users can add their
// own. Each entry pins the activity to one of @kyneticbio/core's three
// engine classes (cardio/resistance/hiit) which the simulation treats
// uniformly. The `metValue` is the multiple-of-resting-metabolic-rate
// from the Compendium of Physical Activities — used for calorie-burn
// math at log time. Disabled rows hide from pickers but historical
// ExerciseLog entries keep their data.
const ENGINE_CLASSES = ['exercise_cardio', 'exercise_resistance', 'exercise_hiit', 'exercise_recovery'];

const exerciseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    isSystem: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    engineClass: { type: String, enum: ENGINE_CLASSES, required: true },
    // MET (Metabolic Equivalent of Task). 1 MET ≈ 1 kcal/kg/hour at rest.
    // Used to derive caloriesBurned at log time:
    //   kcal = METs × weightKg × hours × intensity
    metValue: { type: Number, required: true, min: 1 },
    // Per-activity defaults so new ExerciseLog rows can pre-fill sensibly
    // without the picker having to remember last-used values.
    defaultDurationMin: { type: Number, default: 30 },
    defaultIntensity: { type: Number, default: 1.0, min: 0.5, max: 1.5 },
    icon: { type: String, default: '' },
    color: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

exerciseSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model('Exercise', exerciseSchema);
export { ENGINE_CLASSES };
