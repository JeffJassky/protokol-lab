import mongoose from 'mongoose';
import { defineModel } from '../db/baseModel.js';

const JobSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, index: true }, // 'contacts.classify' | 'influencers.research' | ...
    status: {
      type: String,
      enum: ['queued', 'running', 'done', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    payload: mongoose.Schema.Types.Mixed,
    result: mongoose.Schema.Types.Mixed,
    error: String,

    // Atomic claim fields
    lockedBy: { type: String, index: true },
    lockedAt: Date,

    contactId: { type: mongoose.Schema.Types.ObjectId, index: true },
    listId: { type: mongoose.Schema.Types.ObjectId, index: true },
    opportunityId: { type: mongoose.Schema.Types.ObjectId, index: true },

    budget: {
      capUsd: Number,
      spentUsd: { type: Number, default: 0 },
    },

    // Per-job tool/llm call audit trail. Lightweight summaries; full
    // events go to UsageLog.
    toolCalls: [
      {
        tool: String,
        model: String,
        ts: Date,
        costUsd: Number,
        tokensIn: Number,
        tokensOut: Number,
        ok: Boolean,
        error: String,
      },
    ],

    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true, collection: undefined }
);

JobSchema.index({ status: 1, lockedBy: 1, type: 1 });

export function buildJobModel(conn, prefix) {
  return defineModel(conn, prefix, 'MarketingJob', JobSchema, 'jobs');
}
