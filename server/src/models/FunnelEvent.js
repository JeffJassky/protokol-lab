import mongoose from 'mongoose';

// Self-hosted funnel telemetry. One row per tracked event. Sources:
//   - server emit: demo_start, demo_signup_convert, demo_feature_click, …
//                  (see lib/demoEvents.js — dual-writes log + insert here)
//   - client beacon: page_view, cta_click, … via POST /api/track
//
// Identity model:
//   anonId  — long-lived bo_aid cookie set on first request. Stable per
//             browser, survives demo→register. Not derivable from PII.
//   userId  — set when the event is fired by an authed session, OR
//             backfilled at register time onto every prior event sharing
//             this anonId. Lets a /pricing → demo → register session join
//             into a single funnel.
//
// Cardinality discipline: `name` is allowlisted (see lib/funnelEvents.js);
// `props` is shallow-merged but capped at 16 keys × 200 chars.
const funnelEventSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  anonId: { type: String, default: null, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  sandboxId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Free-form low-cardinality dimensions emitted with the event. Validated
  // upstream — Mixed here so we don't have to migrate when we add a key.
  props: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Acquisition attribution captured at event time. Lifted from req.query
  // for server emits, from the navigated URL for client beacons.
  utmSource: { type: String, default: null },
  utmMedium: { type: String, default: null },
  utmCampaign: { type: String, default: null },

  // Page context (client beacons only; null on pure server emits).
  path: { type: String, default: null },
  referrer: { type: String, default: null },
  ua: { type: String, default: null },
  ip: { type: String, default: null },

  ts: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 },
});

// Funnel queries hit (name, ts) — one per step, windowed.
funnelEventSchema.index({ name: 1, ts: -1 });
// Per-user timeline lookup.
funnelEventSchema.index({ userId: 1, ts: -1 });
// Anon-stitch backfill.
funnelEventSchema.index({ anonId: 1, ts: -1 });

export default mongoose.model('FunnelEvent', funnelEventSchema);
