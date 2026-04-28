import mongoose from 'mongoose';
import { defineModel } from '../../../shared/db/baseModel.js';

const TriageSchema = new mongoose.Schema(
  {
    fit: { type: String, enum: ['high', 'medium', 'low', 'no'] },
    reasoning: String,
    valueAngle: String,
    risks: [String],
    model: String,
    costUsd: Number,
    completedAt: Date,
  },
  { _id: false }
);

const DraftSchema = new mongoose.Schema(
  {
    body: String,
    confidence: Number,
    voiceContactIdAtDraft: mongoose.Schema.Types.ObjectId,
    model: String,
    costUsd: Number,
    generatedAt: Date,
    citations: [String],
  },
  { _id: false }
);

const PerformanceSchema = new mongoose.Schema(
  {
    score: Number,
    replyCount: Number,
    lastCheckedAt: Date,
  },
  { _id: false }
);

const EngagementOpportunitySchema = new mongoose.Schema(
  {
    subredditId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    subreddit: { type: String, index: true }, // denormalized for query
    postId: { type: String, required: true, index: true },
    postUrl: String,
    title: String,
    postExcerpt: String,
    authorUsername: { type: String, index: true },
    authorContactId: { type: mongoose.Schema.Types.ObjectId, index: true },
    authorPostKarma: Number,
    postedAt: Date,
    postScore: Number,
    postCommentCount: Number,
    matchedKeywords: [String],
    triage: TriageSchema,
    draft: DraftSchema,
    status: {
      type: String,
      enum: [
        'new',
        'triaged',
        'drafted',
        'reviewed',
        'dismissed',
        'posted',
        'replied-to',
        'low-fit-archived',
      ],
      default: 'new',
      index: true,
    },
    reviewerNotes: String,
    postedAtUs: Date,
    postedCommentId: String,
    postedCommentUrl: String,
    postPerformance: PerformanceSchema,
  },
  { timestamps: true, collection: undefined }
);

EngagementOpportunitySchema.index({ subredditId: 1, postId: 1 }, { unique: true });
EngagementOpportunitySchema.index({ status: 1, 'triage.fit': 1 });

export function buildEngagementOpportunityModel(conn, prefix) {
  return defineModel(
    conn,
    prefix,
    'MarketingEngagementOpportunity',
    EngagementOpportunitySchema,
    'engagement_opportunities'
  );
}
