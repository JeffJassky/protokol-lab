import mongoose from 'mongoose';
import { defineModel } from '../../../shared/db/baseModel.js';

const ScanRulesSchema = new mongoose.Schema(
  {
    keywords: [String],
    excludeKeywords: [String],
    maxPostAgeHours: { type: Number, default: 72 },
    minPostScore: { type: Number, default: 1 },
    fitnessFilters: {
      mustBeQuestion: { type: Boolean, default: false },
    },
    // Cost-saving prefilter applied in scan.js BEFORE an opportunity is
    // recorded. Failing posts never get triaged → no LLM cost.
    prefilter: {
      minKeywordMatches: Number,   // require ≥N matched keywords
      maxComments: Number,         // skip threads more saturated than this
      minScore: Number,            // can be stricter than minPostScore
      titleBlocklist: [String],    // case-insensitive substring blocklist
    },
  },
  { _id: false }
);

const MonitoredSubredditSchema = new mongoose.Schema(
  {
    subreddit: { type: String, required: true, index: true }, // 'tirzepatide' (no r/)
    active: { type: Boolean, default: true, index: true },
    autoScanEnabled: { type: Boolean, default: false, index: true },
    voiceContactId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    scanRules: { type: ScanRulesSchema, default: () => ({}) },
    scanIntervalMinutes: { type: Number, default: 1440 },
    budget: {
      perRunCapUsd: { type: Number, default: 0.25 },
      monthlyCapUsd: { type: Number, default: 10 },
    },
    lastScanAt: Date,
    lastScanFoundCount: Number,
  },
  { timestamps: true, collection: undefined }
);

export function buildMonitoredSubredditModel(conn, prefix) {
  return defineModel(conn, prefix, 'MarketingMonitoredSubreddit', MonitoredSubredditSchema, 'monitored_subreddits');
}
