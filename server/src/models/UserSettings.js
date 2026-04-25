import mongoose from 'mongoose';

// Required-ness is enforced client-side at the *end* of onboarding rather than
// in the schema, so partial saves during the wizard don't fail validation.
// A complete settings doc still has every field.
const userSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  sex: { type: String, enum: ['male', 'female'] },
  age: { type: Number },
  heightInches: { type: Number },
  currentWeightLbs: { type: Number },
  goalWeightLbs: { type: Number },
  // Resting metabolic rate (Mifflin-St Jeor). Auto-computed from
  // sex/age/height/weight on the client; stored so other callers (chat agent,
  // dashboard) can read without recomputing.
  bmr: { type: Number },
  // Total daily energy expenditure. Auto-computed as bmr × activity multiplier
  // when both are present, but user-overridable for people with a measured
  // RMR/TDEE from a metabolic test. Calorie-deficit math uses *this*, not bmr.
  tdee: { type: Number },
  activityLevel: { type: String, enum: ['sedentary', 'light', 'moderate', 'very', 'athlete'] },
  // Signed weekly weight-change rate in lbs (negative = lose).
  goalRateLbsPerWeek: { type: Number },
  targets: {
    calories: { type: Number },
    proteinGrams: { type: Number },
    fatGrams: { type: Number },
    carbsGrams: { type: Number },
  },
  // IANA timezone ("America/Los_Angeles"). Detected from the browser on
  // first save; the reminder scheduler formats HH:mm in this zone so a user
  // who travels still gets their 8am reminder at local 8am.
  timezone: { type: String, default: 'UTC' },
  // Evening (or whenever) "did you track today?" nudge. Skipped when the
  // user already logged a weight / meal / symptom today.
  trackReminder: {
    enabled: { type: Boolean, default: false },
    time: { type: String, default: '20:00' },
  },
  updatedAt: { type: Date, default: Date.now },
});

userSettingsSchema.pre('save', function () {
  this.updatedAt = new Date();
});

export default mongoose.model('UserSettings', userSettingsSchema);
