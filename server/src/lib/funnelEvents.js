// Funnel event writer + allowlists.
//
// Two emit paths converge here:
//   - server: emitDemoEvent (lib/demoEvents.js) calls insertFunnelEvent
//             for the canonical funnel steps it already logs.
//   - client: POST /api/track beacon validates the name against
//             CLIENT_EVENT_ALLOWLIST and calls insertFunnelEvent.
//
// Cardinality is enforced here so the admin aggregations stay cheap and
// a runaway client can't blow up the events collection. Names outside
// the allowlist are rejected; props are clamped.

import FunnelEvent from '../models/FunnelEvent.js';
import { childLogger, errContext } from './logger.js';
import { fire as fireMailerEvent, FUNNEL_TO_MAILER } from '../services/mailery.js';

const log = childLogger('funnel');

// Names the client beacon may emit. Server-emitted names are not gated
// by this list — they come from trusted call-sites.
export const CLIENT_EVENT_ALLOWLIST = new Set([
  'page_view',
  'cta_click',
  'demo_feature_click',
  'pricing_plan_select',
  'signup_form_start',
  'signup_form_submit',
]);

// Funnel steps in canonical order. Drives the admin aggregation. Edit
// alongside docs/blog/customer-journey.md §2.
export const FUNNEL_STEPS = [
  'page_view',
  'cta_click',
  'demo_start',
  'demo_signup_convert',
  'onboarding_complete',
  'subscription_started',
];

const MAX_PROPS_KEYS = 16;
const MAX_STR = 200;
const MAX_KEY = 64;

function clampString(v) {
  if (v == null) return null;
  const s = String(v);
  return s.length > MAX_STR ? s.slice(0, MAX_STR) : s;
}

export function clampProps(props) {
  if (!props || typeof props !== 'object') return {};
  const out = {};
  // Sort keys before slicing so the chosen 16 are deterministic — otherwise
  // a malicious client controls which props survive by insertion order.
  // Also clamps key length so an attacker can't bloat storage with huge keys.
  const keys = Object.keys(props).sort().slice(0, MAX_PROPS_KEYS);
  for (const k of keys) {
    const ck = k.length > MAX_KEY ? k.slice(0, MAX_KEY) : k;
    const v = props[k];
    if (typeof v === 'number' || typeof v === 'boolean') {
      out[ck] = v;
    } else if (v == null) {
      out[ck] = null;
    } else {
      out[ck] = clampString(v);
    }
  }
  return out;
}

// Truncate IP for privacy. IPv4 → /24 (drops last octet), IPv6 → /48
// (drops the lower 80 bits). Keeps geolocation + spam-analysis utility
// while removing per-user identification. Anything unparseable becomes null.
function truncateIp(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  // Express may give us "::ffff:1.2.3.4" (IPv4-mapped IPv6) — peel that off.
  const v4 = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) {
    const parts = v4.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (raw.includes(':')) {
    const groups = raw.split(':');
    // Take the first 3 hextets (=48 bits), pad with :: for the rest.
    return `${groups.slice(0, 3).join(':')}::`;
  }
  return null;
}

// Track in-flight inserts so tests can deterministically await drain.
// Production callers fire-and-forget; tests use waitForFunnelDrain() to
// avoid timing-based flakes.
const inflight = new Set();

// Persist one event. Best-effort — never throw into the caller, the
// Pino log line is the primary record; DB persistence is a bonus.
export function insertFunnelEvent(doc) {
  const p = (async () => {
    try {
      const row = {
        name: doc.name,
        anonId: clampString(doc.anonId),
        userId: doc.userId || null,
        sandboxId: doc.sandboxId || null,
        props: clampProps(doc.props),
        utmSource: clampString(doc.utmSource),
        utmMedium: clampString(doc.utmMedium),
        utmCampaign: clampString(doc.utmCampaign),
        path: clampString(doc.path),
        referrer: clampString(doc.referrer),
        ua: clampString(doc.ua),
        ip: truncateIp(doc.ip),
        ts: doc.ts || new Date(),
      };
      await FunnelEvent.create(row);
      // Bridge to Mailery for the canonical lifecycle names. Best-effort —
      // mailery.fire() swallows its own errors. Skipped if userId is null
      // (Mailery needs an externalId that resolves to a contact).
      const mailerName = FUNNEL_TO_MAILER[doc.name];
      if (mailerName && row.userId) {
        await fireMailerEvent(mailerName, row.userId.toString(), {
          source: 'funnel',
          ...(row.utmSource ? { utmSource: row.utmSource } : {}),
        });
      }
    } catch (err) {
      log.warn({ ...errContext(err), name: doc.name }, 'funnel: insert failed');
    }
  })();
  inflight.add(p);
  p.finally(() => inflight.delete(p));
  return p;
}

// Test helper: resolve when every in-flight insert has settled. Drains
// recursively so a write that started another write is also awaited.
export async function waitForFunnelDrain() {
  while (inflight.size) {
    await Promise.allSettled([...inflight]);
  }
}
