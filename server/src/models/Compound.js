import mongoose from 'mongoose';

// A "compound" is any peptide / drug / substance the user doses on a schedule.
//
// As of the canonical-compound migration, this table holds **only** user-
// defined custom compounds. Anything in the curated GLP-1 catalog
// (Tirzepatide, Semaglutide, Liraglutide, Dulaglutide, Retatrutide, oral
// Semaglutide) is referenced by `coreInterventionKey` directly from
// DoseLog and configured per-user via UserSettings.compoundPreferences.
//
// `isSystem` is kept as a deprecated field for backwards compatibility
// during migration; the migration script flips/deletes all isSystem=true
// rows and new code must not write isSystem=true.
const compoundSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    // Trade/brand names — kept for free-form custom compounds where users
    // record alternate names ("Generic Z" + "Brand Y"). Curated peptide
    // brand names live in core's PEPTIDE_CATALOG.
    brandNames: { type: [String], default: [] },
    // DEPRECATED. After migration, only `false` ever appears here. Kept
    // briefly for read-side compatibility; new writes set it to false
    // (or leave it default).
    isSystem: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    halfLifeDays: { type: Number, required: true, min: 0 },
    intervalDays: { type: Number, required: true, min: 0.5 },
    // PK curve shape. 'bolus' = instant peak (IV-like). 'subq' = absorption
    // phase + elimination (Bateman, ~6h absorption t½). 'depot' = slow
    // absorption from a depot (~24h absorption t½). Defaults to 'subq' since
    // peptides in this app are nearly always self-administered subcutaneously.
    kineticsShape: {
      type: String,
      enum: ['bolus', 'subq', 'depot'],
      default: 'subq',
    },
    doseUnit: {
      type: String,
      enum: ['mg', 'mcg', 'iu', 'ml'],
      default: 'mg',
    },
    color: { type: String, default: '' },
    order: { type: Number, default: 0 },
    // Reminder config — the scheduler checks this every minute in the
    // user's timezone (see UserSettings.timezone). Time is HH:mm, 24h.
    // Dose days are inferred from intervalDays + last DoseLog; the user picks
    // only the time of day the reminder fires.
    reminderEnabled: { type: Boolean, default: false },
    reminderTime: { type: String, default: '' },
  },
  { timestamps: true },
);

compoundSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model('Compound', compoundSchema);
