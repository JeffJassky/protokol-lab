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
    // Push notifications fired at fast-window boundaries. Triggered by the
    // scheduler at the *event's* time (start instant or planned-end instant),
    // not at a user-chosen clock time — fasts already declare when they
    // start/end. Master `enabled` gates both events.
    notifications: {
      enabled: { type: Boolean, default: false },
      // Each toggle has a `minutesBefore` offset. 0 = at the instant; >0
      // fires N minutes earlier (e.g. 30 min before fast starts). Clamped
      // server-side to [0, 720] (12h).
      fastStart: {
        enabled: { type: Boolean, default: true },
        minutesBefore: { type: Number, default: 0 },
      },
      fastEnd: {
        enabled: { type: Boolean, default: true },
        minutesBefore: { type: Number, default: 0 },
      },
    },
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
  // Daily journal note. On by default for legacy users; togglable via the
  // Journal settings page so users who don't journal can hide the textarea
  // on the Log page.
  journal: {
    enabled: { type: Boolean, default: true },
  },
  // Dashboard "Insights" card. Off-switch + a confidence floor: each
  // finding ships with `confidence ∈ [0,1]`, and the card hides any
  // below `minConfidence`. 0.4 = "low" (show most signals), 0.65 = "high"
  // (only strong signals). Default 0.4 keeps day-1 surfaces non-empty.
  insights: {
    enabled: { type: Boolean, default: true },
    minConfidence: { type: Number, default: 0.4, min: 0, max: 1 },
  },
  // Universal tracking-completeness behavior. Governs how the rolling-
  // window math (currently the 7-day budget; future supplement /
  // exercise-streak views) treats days with missing or partial data.
  // See docs/tracked-untracked-days.md for the full contract.
  //   'passive'      — any FoodLog entries → tracked; zero entries →
  //                    auto-untracked; user can override per-day.
  //   'affirmative'  — every past day defaults to untracked until the
  //                    user explicitly marks it tracked. Today is
  //                    always tracked-pending and counts toward
  //                    consumed during the day.
  tracking: {
    confirmationMode: { type: String, enum: ['passive', 'affirmative'], default: 'passive' },
  },
  // Per-user customization for canonical compounds in core's
  // PEPTIDE_CATALOG. Keyed by core intervention key (e.g. 'tirzepatide').
  // Sparse — only persisted when the user diverges from defaults.
  // doseUnit deliberately not here: it's intrinsic to the compound, not
  // a user preference.
  compoundPreferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Exercise feature settings. Off by default. Enabling reveals the
  // exercise card on the log page (per `showOnLog`) and the burn / net-
  // calorie series on the dashboard (per `showOnDashboard`). `energyMode`
  // governs how logged exercise interacts with the calorie-deficit math:
  //   'baseline' — TDEE multiplier already covers workouts; burn shown
  //                for awareness only, target stays put. (default)
  //   'earn'     — calorie target bumps proportionally to burn; exercise
  //                "earns" calories.
  //   'hidden'   — burn not displayed.
  exercise: {
    enabled: { type: Boolean, default: false },
    showOnLog: { type: Boolean, default: true },
    showOnDashboard: { type: Boolean, default: true },
    energyMode: { type: String, enum: ['baseline', 'earn', 'hidden'], default: 'baseline' },
  },
  // Lab bloodwork values. Stored as the same nested shape the engine
  // consumes (Subject.bloodwork): `bloodwork[panelId][fieldKey] = number`.
  // Mongoose Mixed type so we can write any subset of panels/fields the
  // user has filled in without an exhaustive schema. Sanitation +
  // allowed-key enforcement happen at the route level via shared/
  // bloodworkPanels.js — anything not in BLOODWORK_FIELD_INDEX is dropped.
  bloodwork: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Active condition profiles. Stored as `{ [conditionKey]: { enabled,
  // params: { ... } } }` matching the engine's ConditionStateSnapshot.
  // The simulation worker calls buildConditionAdjustments(state) and
  // forwards the resulting receptor/baseline/coupling overrides via
  // engine options. Only keys in shared/bio/conditionsCatalog.CONDITION_KEYS
  // survive sanitation.
  conditions: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Genetic profile. Same nested shape as Subject.genetics so we can
  // pass it through to the engine untouched. Curated subset of fields
  // surfaced via shared/bio/geneticsPanels.GENETICS_PANELS — sanitation
  // drops anything outside that catalog and any value that isn't one
  // of the declared option strings.
  genetics: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Menstrual cycle inputs. Off by default. The simulation engine's
  // estrogen/progesterone/LH/FSH signal definitions read
  // ctx.subject.{cycleDay, cycleLength, lutealPhaseLength}; cycleDay is
  // derived client-side from `lastPeriodStart`. Surface flags gate the
  // cycle-day banner on Log and the cycle-driven hormone series on
  // Dashboard, independently of each other. Notifications are fired by
  // the reminder scheduler at `notifications.time` on the predicted
  // event day for each enabled event type.
  menstruation: {
    enabled: { type: Boolean, default: false },
    lastPeriodStart: { type: Date, default: null },
    cycleLength: { type: Number, default: 28 },
    lutealPhaseLength: { type: Number, default: 14 },
    showOnLog: { type: Boolean, default: true },
    showOnDashboard: { type: Boolean, default: true },
    notifications: {
      enabled: { type: Boolean, default: false },
      time: { type: String, default: '09:00' },
      // Each event toggle fires at `time` on the predicted day, offset by
      // its own `daysBefore` (0 = day-of). Predictions follow from
      // lastPeriodStart + cycleLength + lutealPhaseLength.
      periodExpected:    { enabled: { type: Boolean, default: true  }, daysBefore: { type: Number, default: 1 } },
      ovulationExpected: { enabled: { type: Boolean, default: false }, daysBefore: { type: Number, default: 0 } },
      fertileWindow:     { enabled: { type: Boolean, default: false }, daysBefore: { type: Number, default: 0 } },
      pmsWindow:         { enabled: { type: Boolean, default: false }, daysBefore: { type: Number, default: 5 } },
      latePeriod:        { enabled: { type: Boolean, default: false }, daysAfter:  { type: Number, default: 2 } },
    },
  },
  // Cached PK/PD sim end-state. Lets `/api/sim/*` resume forward from
  // here instead of re-simulating from t=0 every request. Schema-versioned:
  // bump CHECKPOINT_SCHEMA_VERSION in src/sim/checkpoint.js when the
  // SimulationState shape changes in @kyneticbio/core (new compartment,
  // new receptor pool, etc.) — mismatch at read = treated as missing,
  // forces a clean recompute.
  //
  // Invalidation rules (see src/sim/invalidationHooks.js):
  //   - Log write at date D: nuke if D <= checkpoint.date
  //   - Subject mutation (bloodwork/genetics/weight/etc): full nuke
  //   - Custom food/compound edit: full nuke (retroactive impact)
  latestSimCheckpoint: {
    date: { type: Date, default: null },          // checkpoint valid through this UTC midnight
    endState: { type: mongoose.Schema.Types.Mixed, default: null },
    computedAt: { type: Date, default: null },
    schemaVersion: { type: Number, default: 0 },
    inputsThroughDate: { type: Date, default: null },
  },
  updatedAt: { type: Date, default: Date.now },
});

userSettingsSchema.pre('save', function () {
  this.updatedAt = new Date();
});

export default mongoose.model('UserSettings', userSettingsSchema);
