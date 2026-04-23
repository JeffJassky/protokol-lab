import mongoose from 'mongoose';

// A "compound" is any peptide / drug / substance the user doses on a schedule.
// The catalog mixes system-seeded entries (isSystem=true, locked name) with
// user-defined ones. Disabled rows (enabled=false) hide from log forms and
// chart pickers but keep their historical DoseLog entries intact.
const compoundSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    isSystem: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    halfLifeDays: { type: Number, required: true, min: 0 },
    intervalDays: { type: Number, required: true, min: 0.5 },
    doseUnit: {
      type: String,
      enum: ['mg', 'mcg', 'iu', 'ml'],
      default: 'mg',
    },
    color: { type: String, default: '' },
    order: { type: Number, default: 0 },
    // Reminder config — the scheduler checks this every minute in the
    // user's timezone (see UserSettings.timezone). Times are HH:mm, 24h.
    // reminderWeekdays empty = every day; otherwise a subset of 0–6 (Sun=0).
    reminderEnabled: { type: Boolean, default: false },
    reminderTimes: { type: [String], default: [] },
    reminderWeekdays: { type: [Number], default: [] },
  },
  { timestamps: true },
);

compoundSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model('Compound', compoundSchema);
