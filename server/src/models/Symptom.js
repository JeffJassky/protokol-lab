import mongoose from 'mongoose';

const symptomSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

symptomSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model('Symptom', symptomSchema);
