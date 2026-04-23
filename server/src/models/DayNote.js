import mongoose from 'mongoose';

const dayNoteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  text: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

dayNoteSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model('DayNote', dayNoteSchema);
