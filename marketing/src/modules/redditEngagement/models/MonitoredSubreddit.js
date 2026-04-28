import mongoose from 'mongoose';
import { defineModel } from '../../../shared/db/baseModel.js';

const ScanRulesSchema = new mongoose.Schema(
  {
    keywords: [String],
    excludeKeywords: [String],
    maxPostAgeHours: { type: Number, default: 72 },
    minPostScore: { type: Number, default: 1 },
    minCommentScore: Number,
    fitnessFilters: {
      mustBeQuestion: { type: Boolean, default: false },
      avoidAlreadyAnsweredCount: Number,
      avoidNicheMismatch: { type: Boolean, default: true },
    },
  },
  { _id: false }
);

const MonitoredSubredditSchema = new mongoose.Schema(
  {
    subreddit: { type: String, required: true, index: true }, // 'tirzepatide' (no r/)
    active: { type: Boolean, default: true, index: true },
    voiceContactId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    scanRules: { type: ScanRulesSchema, default: () => ({}) },
    scanIntervalMinutes: { type: Number, default: 30 },
    budget: {
      perRunCapUsd: { type: Number, default: 0.25 },
      monthlyCapUsd: { type: Number, default: 10 },
    },
    lastScanAt: Date,
    lastScanFoundCount: Number,
    totalPostsPosted: { type: Number, default: 0 },
    totalUpvotesEarned: { type: Number, default: 0 },
  },
  { timestamps: true, collection: undefined }
);

export function buildMonitoredSubredditModel(conn, prefix) {
  return defineModel(conn, prefix, 'MarketingMonitoredSubreddit', MonitoredSubredditSchema, 'monitored_subreddits');
}
