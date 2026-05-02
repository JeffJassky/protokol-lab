import mongoose from 'mongoose';

// User-tracked biometric measurement type. Two flavors:
//   - presets (`isPreset: true`) seeded from shared/metricPresets.js on first
//     fetch. Disabling a preset hides it; deleting is forbidden.
//   - customs created by the user with their own name + dimension.
//
// Values themselves live in MetricLog. Storage is canonical units per the
// `dimension` (cm for length, g for mass, etc. — see shared/units.js); display
// resolves to the user's unitSystem default unless `displayUnit` overrides.
const metricSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Stable slug used to pair preset rows across users (`arm_left`, `waist`).
    // Custom metrics get a generated slug from their name; not globally unique.
    key: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: 'custom' },
    dimension: { type: String, required: true },
    // Optional unit override. When set, render in this unit regardless of the
    // user's unitSystem. Useful for things like body fat % which is always %,
    // or pinning a specific metric to cm even on imperial.
    displayUnit: { type: String, default: null },
    isPreset: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// One Metric row per (user, key). Re-enabling a previously disabled preset
// updates the existing row rather than creating a duplicate.
metricSchema.index({ userId: 1, key: 1 }, { unique: true });

export default mongoose.model('Metric', metricSchema);
