import mongoose from 'mongoose';
import { defineModel } from '../../shared/db/baseModel.js';

const FilterSchema = new mongoose.Schema(
  {
    roles: [String],
    classifications: [String],
    tags: [String],
    audienceMin: Number,
    audienceMax: Number,
    status: [String],
    excludeConflicts: { type: Boolean, default: false },
  },
  { _id: false }
);

const ContactListSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    contextPrompt: String,
    pitchSummary: String,
    filters: FilterSchema,
    contactCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: undefined }
);

export function buildContactListModel(conn, prefix) {
  return defineModel(conn, prefix, 'MarketingContactList', ContactListSchema, 'contact_lists');
}
