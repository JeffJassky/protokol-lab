import mongoose from 'mongoose';
import { defineModel } from '../db/baseModel.js';

const UsageLogSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, index: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, index: true },
    module: { type: String, index: true },
    kind: String, // 'anthropic'|'perplexity'|'youtube'|'reddit'|...
    model: String,
    tokensIn: Number,
    tokensOut: Number,
    costUsd: { type: Number, default: 0 },
    ts: { type: Date, default: Date.now, index: true },
  },
  { collection: undefined } // set by defineModel
);

UsageLogSchema.index({ module: 1, ts: -1 });

export function buildUsageModels(conn, prefix) {
  return {
    UsageLog: defineModel(conn, prefix, 'MarketingUsageLog', UsageLogSchema, 'usage_logs'),
  };
}
