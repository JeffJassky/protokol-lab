import mongoose from 'mongoose';
import { defineModel } from '../db/baseModel.js';

const PromptVariableSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    sample: String,
  },
  { _id: false }
);

const PromptSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, index: true }, // 'contacts.classify'
    module: { type: String, required: true }, // 'shared'|'contacts'|'influencers'|...
    title: String,
    description: String,
    body: { type: String, required: true },
    defaultBody: { type: String, required: true },
    variables: [PromptVariableSchema],
    outputSchema: mongoose.Schema.Types.Mixed,
    modelSlot: String, // 'research'|'draft'|'triage'|'classify'
    version: { type: Number, required: true },
    isActive: { type: Boolean, default: false, index: true },
    editedBy: String,
    editedAt: Date,
    createdAt: { type: Date, default: Date.now },
  },
  { collection: undefined }
);

PromptSchema.index({ key: 1, version: -1 });
PromptSchema.index({ key: 1, isActive: 1 });

export function buildPromptModels(conn, prefix) {
  return {
    Prompt: defineModel(conn, prefix, 'MarketingPrompt', PromptSchema, 'prompts'),
  };
}
