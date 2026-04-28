import mongoose from 'mongoose';
import { defineModel } from '../../../shared/db/baseModel.js';

const EngagementRunSchema = new mongoose.Schema(
  {
    subredditId: { type: mongoose.Schema.Types.ObjectId, index: true },
    startedAt: Date,
    finishedAt: Date,
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
    postsScanned: Number,
    candidatesIdentified: Number,
    triagedFit: Number,
    triagedNoFit: Number,
    draftsGenerated: Number,
    totalCostUsd: Number,
    error: String,
  },
  { timestamps: true, collection: undefined }
);

export function buildEngagementRunModel(conn, prefix) {
  return defineModel(conn, prefix, 'MarketingEngagementRun', EngagementRunSchema, 'engagement_runs');
}
