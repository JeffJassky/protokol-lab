import mongoose from 'mongoose';

const symptomLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    symptomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Symptom', required: true },
    date: { type: Date, required: true },
    severity: { type: Number, required: true, min: 0, max: 10 },
  },
  { timestamps: true },
);

// One log per (user, symptom, date) — upserting the same combo just updates
// the severity rather than creating duplicates.
symptomLogSchema.index({ userId: 1, symptomId: 1, date: 1 }, { unique: true });
symptomLogSchema.index({ userId: 1, date: 1 });

export default mongoose.model('SymptomLog', symptomLogSchema);
