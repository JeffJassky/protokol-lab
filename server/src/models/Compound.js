import mongoose from 'mongoose';

// A "compound" is any peptide / drug / substance the user doses on a schedule.
// The catalog mixes system-seeded entries (isSystem=true, locked name) with
// user-defined ones. Disabled rows (enabled=false) hide from log forms and
// chart pickers but keep their historical DoseLog entries intact.
const compoundSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    // Trade/brand names the same active substance is sold under (e.g.
    // Tirzepatide → ["Mounjaro", "Zepbound"]). Surfaced in pickers so users
    // can recognize what their prescription is. Optional; empty for custom.
    brandNames: { type: [String], default: [] },
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
