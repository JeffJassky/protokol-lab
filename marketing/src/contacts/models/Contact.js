import mongoose from 'mongoose';
import { defineModel } from '../../shared/db/baseModel.js';

// See marketing/PLAN.md §5.1 for the full schema rationale. The collection
// is shared infrastructure — every module reads/writes Contacts. The
// `relationship` field distinguishes targets, our own voices, teammates.

const PresenceSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
      enum: [
        'podcast',
        'substack',
        'youtube',
        'x',
        'instagram',
        'tiktok',
        'reddit',
        'blog',
        'website',
        'linkedin',
        'apple-podcasts',
        'spotify',
        'rss',
        'other',
      ],
    },
    handle: { type: String }, // normalized lowercase (see pre-validate hook)
    url: String,
    role: String, // 'host'|'writer'|'author'|'commenter'|'owner'
    audienceSize: Number,
    audienceSizeRaw: String,
    audienceConfidence: { type: String, enum: ['low', 'medium', 'high'] },
    isPrimary: { type: Boolean, default: false },
    metadata: mongoose.Schema.Types.Mixed,
    notes: String,
  },
  { _id: true }
);

const ContactChannelSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'email',
        'reddit_dm',
        'x_dm',
        'instagram_dm',
        'substack_message',
        'youtube_business',
        'contact_form',
        'linkedin_inmail',
        'other',
      ],
    },
    value: String,
    sourceUrl: String,
    confidence: { type: String, enum: ['guessed', 'scraped', 'verified'] },
    isPreferred: { type: Boolean, default: false },
    notes: String,
  },
  { _id: true }
);

const VoiceProfileSchema = new mongoose.Schema(
  {
    active: { type: Boolean, default: false },
    voiceDescription: String,
    // Slim, cheap, ~150-token version used by triage (Haiku). Full
    // voiceDescription is only sent to the draft step. Cuts triage cost
    // ~3-5x by not shipping the entire persona block on every classify.
    triageCard: String,
    expertiseTags: [String],
    doNotMention: [String],
    // selfPromoPolicy removed 2026-04-30 — bucket-based classification
    // (DIRECT_ASK / INDIRECT_PROBLEM / TOPIC_ADJACENT / SKIP) drives
    // whether/how to mention the product per-post. See plans/reddit-classification.md.
    signatureSnippet: String,
    redditPresenceId: mongoose.Schema.Types.ObjectId,
    xPresenceId: mongoose.Schema.Types.ObjectId,
    instagramPresenceId: mongoose.Schema.Types.ObjectId,
    notes: String,
  },
  { _id: false }
);

const RecentContentSchema = new mongoose.Schema(
  {
    title: String,
    url: String,
    publishedAt: Date,
    platform: String,
    summary: String,
    distinctivePoint: String,
  },
  { _id: false }
);

const PersonalizedHookSchema = new mongoose.Schema(
  {
    text: String,
    sourceContentUrl: String,
    generatedAt: Date,
    model: String,
    jobId: mongoose.Schema.Types.ObjectId,
  },
  { _id: false }
);

const ContactSourceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'manual',
        'people_md_import',
        'reddit_engagement_link',
        'csv_import',
        'research_paste',
        'self_setup',
        'other',
      ],
    },
    note: String,
    linkedFromOpportunityId: mongoose.Schema.Types.ObjectId,
    importedAt: Date,
  },
  { _id: false }
);

const ContactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    displayHandle: String,

    relationship: {
      type: String,
      enum: ['target', 'self', 'team', 'unknown'],
      default: 'target',
      index: true,
    },
    classification: {
      type: String,
      enum: [
        'influencer',
        'creator',
        'journalist',
        'company',
        'partner',
        'prospect',
        'employee',
        'other',
      ],
      index: true,
    },
    roles: { type: [String], index: true },
    primaryRole: String,
    bio: String,
    niche: String,
    tags: { type: [String], index: true },

    presences: [PresenceSchema],
    contactChannels: [ContactChannelSchema],
    voiceProfile: VoiceProfileSchema,

    conflicts: [String],
    doNotContact: { type: Boolean, default: false },
    doNotContactReason: String,
    status: {
      type: String,
      enum: [
        'new',
        'researching',
        'enriched',
        'drafted',
        'sent',
        'replied',
        'declined',
        'do_not_contact',
      ],
      default: 'new',
      index: true,
    },
    enrichmentSummary: String,
    recentContent: [RecentContentSchema],
    personalizedHooks: [PersonalizedHookSchema],

    // Module-namespaced state. Schema-less so modules can attach arbitrary
    // fields without a migration. Each module owns its own subkey.
    modules: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },

    source: ContactSourceSchema,
    listIds: [{ type: mongoose.Schema.Types.ObjectId, index: true }],
    // `customFields` removed — `modules: Mixed` already covers per-module
    // namespaced extension and was the only field actually used.

    lastResearchedAt: Date,
  },
  { timestamps: true, collection: undefined }
);

ContactSchema.index({ name: 'text', niche: 'text', bio: 'text', tags: 'text' });
ContactSchema.index({ 'presences.platform': 1, 'presences.handle': 1 });
ContactSchema.index({ 'voiceProfile.active': 1 });

// Normalize presence handles to lowercase so cross-module lookups (e.g.
// Reddit author-linking) match consistently regardless of how the user
// entered them.
ContactSchema.pre('validate', function () {
  if (Array.isArray(this.presences)) {
    for (const p of this.presences) {
      if (p.handle) p.handle = p.handle.toLowerCase().replace(/^[@]/, '').replace(/^u\//, '');
    }
  }
});

export function buildContactModel(conn, prefix) {
  return defineModel(conn, prefix, 'MarketingContact', ContactSchema, 'contacts');
}
