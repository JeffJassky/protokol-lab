import mongoose from 'mongoose';

const chatThreadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, default: 'New conversation' },
    messages: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true },
);

chatThreadSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.model('ChatThread', chatThreadSchema);
