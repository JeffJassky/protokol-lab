import mongoose from 'mongoose';

const doseLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  compound: { type: String, default: 'retatrutide' },
  doseMg: { type: Number, required: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

doseLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('DoseLog', doseLogSchema);
