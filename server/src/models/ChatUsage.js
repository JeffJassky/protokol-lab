import mongoose from 'mongoose';

// One row per completed (or failed) chat turn. Token and cost figures are
// summed across every iteration of the agentic loop for that single user
// message. Written from routes/chat.js after the stream ends.
const chatUsageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  threadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatThread',
    default: null,
  },

  model: { type: String, required: true },
  // Plan id at the time the message was sent — preserved so historical cost
  // totals aren't misattributed when a user upgrades or downgrades later.
  planAtTime: { type: String, default: null },

  // Tokens summed across all iterations of the agentic loop.
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  thoughtTokens: { type: Number, default: 0 },
  toolTokens: { type: Number, default: 0 },
  cachedInputTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },

  // USD cost computed at write time from lib/pricing.js.
  inputCostUsd: { type: Number, default: 0 },
  outputCostUsd: { type: Number, default: 0 },
  searchCostUsd: { type: Number, default: 0 },
  totalCostUsd: { type: Number, default: 0 },

  // Execution metadata.
  iterations: { type: Number, default: 0 },
  toolCalls: { type: Number, default: 0 },
  searchCalls: { type: Number, default: 0 },
  // How many food images were sent on this turn. Used by requireChatQuota to
  // enforce daily image caps and by analytics to track feature adoption.
  imageCount: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },
  // 'ok' | 'error' | 'max_iterations' | 'aborted'
  status: { type: String, default: 'ok' },
  errorMessage: { type: String, default: null },

  createdAt: { type: Date, default: Date.now, index: true },
});

// Primary access pattern: sum usage for a user over the last N days.
chatUsageSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('ChatUsage', chatUsageSchema);
