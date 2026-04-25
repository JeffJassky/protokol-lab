import mongoose from 'mongoose';

// A pending agent-proposed set of food entries. Created when the agent calls
// propose_food_entries after identifying a photo. The client renders inline
// Confirm/Edit/Cancel buttons; confirm hits /api/chat/proposals/:id/confirm
// which bulk-writes to FoodLog. TTL cleans up unanswered proposals so they
// don't accumulate — a stale one-hour-old proposal is useless to confirm.
const mealProposalItemSchema = new mongoose.Schema(
  {
    // Optional: if the agent matched against an existing FoodItem via
    // lookup_food_macros, it can reference the id so we reuse the catalog
    // entry instead of creating a duplicate.
    foodItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', default: null },
    name: { type: String, required: true },
    brand: { type: String, default: '' },
    emoji: { type: String, default: '' },
    // Human-readable portion description ("1 medium chicken breast").
    portion: { type: String, default: '' },
    grams: { type: Number, default: null },
    // Per-portion macros the user is about to log. These are the final
    // numbers — the agent has already multiplied if needed.
    calories: { type: Number, required: true },
    protein: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    // 'high' | 'medium' | 'low' — surfaces to the user so they know which
    // items to scrutinize before confirming.
    confidence: { type: String, default: 'medium' },
    source: { type: String, default: '' }, // 'database' | 'web' | 'estimate'
  },
  { _id: false },
);

const mealProposalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatThread', default: null, index: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'], required: true },
  items: { type: [mealProposalItemSchema], default: [] },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'expired'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
  // Pending proposals auto-expire after 1h so the server doesn't hold stale
  // context the user has moved on from. Confirmed/cancelled stay forever for
  // audit/history.
  expiresAt: { type: Date, default: () => new Date(Date.now() + 60 * 60 * 1000) },
});

// Partial TTL: only expire docs that are still pending. Mongo ignores the TTL
// once status flips, so confirmed proposals persist.
mealProposalSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { status: 'pending' } },
);

export default mongoose.model('MealProposal', mealProposalSchema);
