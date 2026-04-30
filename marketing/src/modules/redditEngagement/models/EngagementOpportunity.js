import mongoose from 'mongoose';
import { defineModel } from '../../../shared/db/baseModel.js';

// Triage output — classifies posts into action-oriented buckets, not
// generic fit scores. Each bucket implies a specific reply strategy.
// See plans/reddit-classification.md for the full rubric.
const TriageSchema = new mongoose.Schema(
  {
    bucket: {
      type: String,
      enum: ['DIRECT_ASK', 'INDIRECT_PROBLEM', 'TOPIC_ADJACENT', 'SKIP'],
    },
    because: String, // ≤15-word rationale from the slim triage prompt
    completedAt: Date,
  },
  { _id: false }
);

// Draft body. Other prior fields (citations, confidence,
// voiceContactIdAtDraft, model, costUsd) were never read; dropped.
const DraftSchema = new mongoose.Schema(
  {
    body: String,
    generatedAt: Date,
  },
  { _id: false }
);

const EngagementOpportunitySchema = new mongoose.Schema(
  {
    subredditId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    subreddit: { type: String, index: true }, // denormalized for query

    // Reddit identity. Keyed unique with subredditId for upsert dedup.
    postId: { type: String, required: true, index: true },
    postUrl: String,
    title: String,
    postExcerpt: String,

    // Author = just a username string. We do NOT auto-create Contacts for
    // every reddit poster (that pollutes the CRM). The user can manually
    // link an author → Contact via the route handler if they want.
    authorUsername: { type: String, index: true },
    authorContactId: { type: mongoose.Schema.Types.ObjectId, index: true },

    postedAt: Date,
    postScore: Number,
    postCommentCount: Number,
    matchedKeywords: [String],

    triage: TriageSchema,
    draft: DraftSchema,

    // Pipeline state — workflow position (set by scan/triage/draft jobs).
    status: {
      type: String,
      enum: ['new', 'triaged', 'drafted', 'posted', 'low-fit-archived'],
      default: 'new',
      index: true,
    },

    // User intent — what the human decided about this opportunity. Drives
    // the feed query (the feed shows decision:'pending' by default). When
    // a user passes/saves/replies, the row stays as a tombstone so future
    // scans don't re-surface the same post.
    decision: {
      type: String,
      enum: ['pending', 'passed', 'saved', 'replied', 'dismissed'],
      default: 'pending',
      index: true,
    },
    decidedAt: Date,
    decisionNote: String,

    // Posted-reply tracking.
    postedAtUs: Date,
    postedCommentUrl: String,
  },
  { timestamps: true, collection: undefined }
);

EngagementOpportunitySchema.index({ subredditId: 1, postId: 1 }, { unique: true });
EngagementOpportunitySchema.index({ decision: 1, 'triage.bucket': 1, postedAt: -1 });

export function buildEngagementOpportunityModel(conn, prefix) {
  return defineModel(
    conn,
    prefix,
    'MarketingEngagementOpportunity',
    EngagementOpportunitySchema,
    'engagement_opportunities'
  );
}
