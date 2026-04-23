import mongoose from 'mongoose';

const waistLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  waistInches: { type: Number, required: true },
  date: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

waistLogSchema.index({ userId: 1, date: -1 });

export default mongoose.model('WaistLog', waistLogSchema);
