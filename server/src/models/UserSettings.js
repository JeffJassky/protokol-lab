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
  // Unit system preference for displaying biometric measurements (arms, etc.)
  // Storage is always canonical (cm/g/etc.); this only affects render +
  // input. See shared/units.js for the dimension → unit mapping.
  unitSystem: { type: String, enum: ['imperial', 'metric'], default: 'imperial' },
  // Evening (or whenever) "did you track today?" nudge. Skipped when the
  // user already logged a weight / meal / symptom today.
  trackReminder: {
    enabled: { type: Boolean, default: false },
    time: { type: String, default: '20:00' },
  },
  // Intermittent-fasting feature. The schedule here is the *rule*; actual
  // fast occurrences live in FastingEvent. `iana_tz` is captured at save
  // time so DST math is deterministic (independent of the user's later
  // device tz). `weeklyRules` is only consulted when kind === 'weekly'.
  fasting: {
    enabled: { type: Boolean, default: false },
    showOnLog: { type: Boolean, default: true },
    showOnDashboard: { type: Boolean, default: true },
    kind: { type: String, enum: ['none', 'daily', 'weekly'], default: 'daily' },
    protocol: { type: String, default: '16:8' },
    fastDurationMinutes: { type: Number, default: 16 * 60 },
    dailyStartTime: { type: String, default: '20:00' },
    weeklyRules: {
      type: [
        {
          _id: false,
          weekday: { type: Number, min: 0, max: 6 },
          startTime: { type: String },
          durationMinutes: { type: Number },
        },
      ],
      default: [],
    },
    ianaTz: { type: String, default: 'UTC' },
  },
  // Progress photos. Off by default; enabling reveals the photo capture
  // card on the log page (per `showOnLog`) and the photo timeline on the
  // dashboard (per `showOnDashboard`). Photo *types* are stored separately
  // in the PhotoType collection — this gates the feature surface, not the
  // type library.
  photos: {
    enabled: { type: Boolean, default: false },
    showOnLog: { type: Boolean, default: true },
    showOnDashboard: { type: Boolean, default: true },
  },
  // Hydration tracker. Off by default; enabling reveals the drop-row on
  // LogPage. `unit` is display-only — volumes always store canonically as ml.
  // `servingMl` is the size of one tap/drop (250 ml ≈ 8 fl oz default).
  // `dailyTargetMl` divided by `servingMl` gives the number of drop icons.
  water: {
    enabled: { type: Boolean, default: false },
    unit: { type: String, enum: ['ml', 'fl_oz'], default: 'fl_oz' },
    dailyTargetMl: { type: Number, default: 2000 },
    servingMl: { type: Number, default: 250 },
    showOnDashboard: { type: Boolean, default: false },
  },
  updatedAt: { type: Date, default: Date.now },
});

userSettingsSchema.pre('save', function () {
  this.updatedAt = new Date();
});

export default mongoose.model('UserSettings', userSettingsSchema);
