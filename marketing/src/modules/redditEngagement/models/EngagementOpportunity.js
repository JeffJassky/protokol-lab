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

// One turn in the drafting chat. The chat is the user-facing iteration
// surface; the agent eventually writes the canonical reply via the
// set_draft MCP tool, which lands in `body`.
const ChatMessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant', 'tool_use', 'tool_result'] },
    content: String,            // text for user/assistant; JSON-stringified payload for tool_*
    toolName: String,           // tool_use / tool_result only
    toolUseId: String,          // pairs tool_use ↔ tool_result
    isError: Boolean,
    ts: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

// Draft body. Other prior fields (citations, confidence,
// voiceContactIdAtDraft, model, costUsd) were never read; dropped.
const DraftSchema = new mongoose.Schema(
  {
    body: String,
    generatedAt: Date,

    // Chat-style drafting (claude subprocess). Each user message kicks
    // off an agent turn; the agent's final reply + any tool calls are
    // appended here for replay on page reopen.
    messages: { type: [ChatMessageSchema], default: undefined },
    // claude session id from the SDK, lets subsequent turns resume the
    // same context cheaply (the SDK passes --resume under the hood).
    sessionId: String,
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
