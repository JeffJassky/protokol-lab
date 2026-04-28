import mongoose from 'mongoose';
import { defineModel } from '../../../shared/db/baseModel.js';

const OutreachDraftSchema = new mongoose.Schema(
  {
    contactId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    listId: { type: mongoose.Schema.Types.ObjectId, index: true },
    channel: { type: String, required: true }, // matches contactChannels[].type
    subject: String,
    body: String,
    hookSentenceUsed: String,
    citations: [String],
    voiceContactId: { type: mongoose.Schema.Types.ObjectId, index: true },

    modelUsed: String,
    costUsd: Number,
    tokensIn: Number,
    tokensOut: Number,

    status: {
      type: String,
      enum: ['draft', 'approved', 'sent', 'replied', 'discarded'],
      default: 'draft',
      index: true,
    },
    approvedAt: Date,
    sentAt: Date,
    replyNotes: String,

    sourceJobId: { type: mongoose.Schema.Types.ObjectId, index: true },
  },
  { timestamps: true, collection: undefined }
);

export function buildOutreachDraftModel(conn, prefix) {
  return defineModel(conn, prefix, 'MarketingOutreachDraft', OutreachDraftSchema, 'outreach_drafts');
}
