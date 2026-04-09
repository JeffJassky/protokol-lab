import mongoose from 'mongoose';

const weightLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  weightLbs: { type: Number, required: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

weightLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('WeightLog', weightLogSchema);
