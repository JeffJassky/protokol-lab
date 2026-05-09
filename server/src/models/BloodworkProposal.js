import mongoose from 'mongoose';

// A pending agent-proposed set of bloodwork updates awaiting user review.
// Created when the agent calls propose_bloodwork_update after the user
// shared lab results in chat. The client renders inline Confirm/Cancel
// buttons; confirm hits /api/chat/bloodwork-proposals/:id/confirm which
// merges the changes into UserSettings.bloodwork. Same TTL-on-pending
// pattern as MealProposal so stale proposals don't accumulate.
const bloodworkChangeSchema = new mongoose.Schema(
  {
    // Dot-path key, e.g. 'metabolic.glucose_mg_dL'. Validated against
    // BLOODWORK_FIELD_INDEX before the proposal is created.
    key: { type: String, required: true },
    // Display label captured at proposal time so the user can review the
    // human-readable change even if the panel schema later evolves.
    label: { type: String, default: '' },
    unit: { type: String, default: '' },
    value: { type: Number, required: true },
    // Pre-existing override at proposal time, if any. Lets the UI show a
    // "12.5 → 14.2" diff so the user knows what's about to change.
    oldValue: { type: Number, default: null },
  },
  { _id: false },
);

const bloodworkProposalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  threadId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatThread', default: null, index: true },
  changes: { type: [bloodworkChangeSchema], default: [] },
  // Free-form note the agent can attach (e.g. "From your 2026-04-12 panel").
  notes: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'expired'],
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 60 * 60 * 1000) },
});

// Partial TTL: only auto-expire pending proposals. Confirmed/cancelled
// stay around for audit history.
bloodworkProposalSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { status: 'pending' } },
);

export default mongoose.model('BloodworkProposal', bloodworkProposalSchema);
