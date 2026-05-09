import mongoose from 'mongoose';

// Per-day tracking status. Sparse — rows only exist when status differs
// from the implicit default (a day with FoodLog entries is `tracked`,
// a day with zero entries is `untracked`). The 7-day rolling budget
// uses this to exclude untracked days from both consumed and target,
// so a missed-logging gap doesn't manifest as "banked calories".
//
// reason is metadata for the user, not the math:
//   forgot   — didn't log, no intent to count it
//   partial  — half-logged, don't trust the data
//   fasted   — intentional zero (only meaningful when status='tracked')
//   other    — free-form, user-chosen
const dayStatusSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // YYYY-MM-DD string. Stored as a string so the unique index is
  // calendar-day exact (avoids the timezone trap of Date-typed primary
  // keys when a user crosses midnight in a different zone).
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  status: {
    type: String,
    enum: ['tracked', 'untracked'],
    required: true,
  },
  reason: {
    type: String,
    enum: ['forgot', 'partial', 'vacation', 'holiday', 'illness', 'fasted', 'other'],
    default: 'other',
  },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

dayStatusSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model('DayStatus', dayStatusSchema);
