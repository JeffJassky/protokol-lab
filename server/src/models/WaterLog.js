import mongoose from 'mongoose';

// Volume stored canonically in ml; client converts to user's preferred unit.
const waterLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  volumeMl: { type: Number, required: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

waterLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('WaterLog', waterLogSchema);
