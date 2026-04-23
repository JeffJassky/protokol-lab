import mongoose from 'mongoose';

// `value` is in the compound's `doseUnit`. We don't normalize across compounds
// (mg ≠ mcg ≠ iu, no universal canonical), so display + math stay scoped to a
// single compound's unit.
const doseLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  compoundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Compound', required: true },
  value: { type: Number, required: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

doseLogSchema.index({ userId: 1, compoundId: 1, date: -1 });
doseLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('DoseLog', doseLogSchema);
