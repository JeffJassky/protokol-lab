import mongoose from 'mongoose';

export const FEATURE_STATUSES = ['open', 'planned', 'in_progress', 'shipped', 'declined'];

const commentSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorEmail: { type: String, required: true },
  authorDisplayName: { type: String, default: null },
  authorIsAdmin: { type: Boolean, default: false },
  body: { type: String, required: true, maxlength: 4000 },
  createdAt: { type: Date, default: Date.now },
});

const featureRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  authorEmail: { type: String, required: true },
  authorDisplayName: { type: String, default: null },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, maxlength: 6000 },
  status: { type: String, enum: FEATURE_STATUSES, default: 'open', index: true },
  // One-vote-per-user — enforced by $addToSet server-side. Count is denormalized
  // so the list endpoint can sort cheaply without an array length projection.
  upvotedBy: { type: [mongoose.Schema.Types.ObjectId], default: [], index: true },
  upvoteCount: { type: Number, default: 0, index: true },
  comments: { type: [commentSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

featureRequestSchema.index({ status: 1, upvoteCount: -1 });
featureRequestSchema.index({ title: 'text', description: 'text' });

export default mongoose.model('FeatureRequest', featureRequestSchema);
