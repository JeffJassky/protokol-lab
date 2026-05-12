// Mailery integration.
//
// Embedded email-automation engine. We boot Mailery alongside the main
// server process — single-droplet deploy, one worker.
//
// Queue driver: Agenda (Mongo-backed). Jobs persist to `_mailerJobs` in
// the same Mongo we already use; no Redis required. Per Mailery docs, the
// agenda driver enforces sendRatePerSecond in-process via Bottleneck — so
// running multiple worker processes would multiply the effective send rate.
// We run exactly one process; if that ever changes, switch to bullmq.
//
// What this module owns:
//   - Mailer instance lifecycle (init + startWorkers + close)
//   - The canonical event taxonomy (names + dedupe policies — keep in
//     lockstep with marketing/emails/index.html where flows are designed)
//   - The funnel→mailer event bridge (FUNNEL_TO_MAILER)
//   - `fire()` / `fireFromSession()` thin wrappers that swallow errors so
//     the email layer can never break a request
//
// Lifecycle on this process:
//   index.js → startMailery() → init → registerEvent × N → startWorkers
//   index.js (SIG*) → stopMailery() → mailer.stop()
//
// Disabled paths:
//   - MAILER_DISABLED=1 (any env) → init is a no-op; fire/fireFromSession
//     become silent. Lets test runs skip Mailery entirely.

import mongoose from 'mongoose';
import {
  Mailer,
  MongoContactAdapter,
  SendGridProvider,
  NullProvider,
} from 'mailery';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('mailery');

// Canonical event taxonomy. Names mirror the flow triggers documented in
// marketing/emails/index.html. Edit both files together.
//
// Dedupe policies:
//   once-per-contact → lifecycle milestones that should fire once ever
//   once-per-day     → behavioral events that can repeat but shouldn't spam
//   every-time       → frequency-uncapped (rare; explicit dedupeKey expected)
export const MAILER_EVENTS = [
  // Lifecycle
  { name: 'Registered',                dedupePolicy: 'once-per-contact' },
  { name: 'Onboarded',                 dedupePolicy: 'once-per-contact' },
  // Stripe-driven
  { name: 'Trial Started',             dedupePolicy: 'once-per-contact' },
  { name: 'Subscribed',                dedupePolicy: 'once-per-contact' },
  { name: 'Cancelled',                 dedupePolicy: 'every-time' },
  { name: 'Paid Tenured',              dedupePolicy: 'once-per-contact' },
  // Behavioral — fire from app code at action sites
  { name: 'Dose Logged',               dedupePolicy: 'once-per-contact' }, // first-dose flow uses once:true; this guards the trigger itself
  { name: 'Dose Changed',              dedupePolicy: 'once-per-day' },
  { name: 'Symptom Logged',            dedupePolicy: 'once-per-day' },
  // Synthetic — fired by scheduled insight worker (see services/scheduler.js)
  { name: 'Plateau Detected',          dedupePolicy: 'once-per-contact' },
  { name: 'Logging Lapsed',            dedupePolicy: 'every-time' },
  { name: 'Doses Lapsed',              dedupePolicy: 'every-time' },
  { name: 'Milestone Reached',         dedupePolicy: 'every-time' },
  { name: 'Engagement Threshold Hit',  dedupePolicy: 'once-per-contact' },
];

// Bridge: when these funnel events insert (lib/funnelEvents.js#insertFunnelEvent),
// dual-emit the mapped Mailery event so flows can trigger off the same
// signal that drives the funnel dashboard. Empty mapping → no Mailery emit.
//
// We deliberately do NOT bridge page_view / cta_click — they're high
// cardinality and not lifecycle moments.
export const FUNNEL_TO_MAILER = {
  demo_signup_convert: 'Registered',
  onboarding_complete: 'Onboarded',
  subscription_started: 'Subscribed',
};

let mailer = null;
let disabled = false;
let initPromise = null;

export function isMaileryDisabled() {
  return disabled;
}

export function getMailer() {
  return mailer;
}

function isExplicitlyDisabled() {
  return process.env.MAILER_DISABLED === '1';
}

// Init + register + start. Idempotent — safe to call twice (returns the
// cached promise). Boot path calls it once; tests can call it directly.
export async function startMailery() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (isExplicitlyDisabled()) {
      disabled = true;
      log.info('mailery disabled via MAILER_DISABLED=1');
      return null;
    }
    if (mongoose.connection.readyState !== 1) {
      throw new Error('mailery: mongoose must be connected before startMailery');
    }

    const sendgridKey = process.env.SENDGRID_API_KEY;
    const providers = sendgridKey
      ? {
        sendgrid: new SendGridProvider({
          apiKey: sendgridKey,
          // Set this to the ECDSA public key from
          // SendGrid → Settings → Mail Settings → Signed Event Webhook.
          // Without it, parseWebhookEvents in the public router will reject
          // every inbound event for failing signature verification.
          webhookVerificationKey: process.env.SENDGRID_WEBHOOK_VERIFICATION_KEY,
        }),
      }
      : { null: new NullProvider() };
    const defaultProvider = sendgridKey ? 'sendgrid' : 'null';
    if (!sendgridKey) {
      log.warn('mailery: SENDGRID_API_KEY not set — using NullProvider (no real sends)');
    }

    const fromName = process.env.SENDGRID_FROM_NAME || 'Jeff Jassky';
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'jeff@protokollab.com';
    const senderAddress = process.env.MAILER_SENDER_ADDRESS
      || 'Protokol Lab, PO Box TBD, USA';
    const publicUrl = process.env.MAILER_PUBLIC_URL
      || process.env.APP_URL
      || 'https://protokollab.com';
    const unsubscribeSecret = process.env.MAILER_UNSUB_SECRET
      || process.env.JWT_SECRET;
    if (!process.env.MAILER_UNSUB_SECRET) {
      log.warn('mailery: MAILER_UNSUB_SECRET not set — falling back to JWT_SECRET (set a dedicated secret in prod)');
    }

    const t0 = Date.now();
    mailer = await Mailer.init({
      db: mongoose.connection.db,
      adapter: new MongoContactAdapter({
        db: mongoose.connection.db,
        collection: 'users',
        emailField: 'email',
        idField: '_id',
        tagsField: 'tags',
        tagsWritable: true,
      }),
      // Mongo-backed queue (Agenda). Jobs live in `_mailerJobs`; no Redis.
      // Single-worker enforcement of rate limits — do not scale beyond one
      // worker process or sendRatePerSecond multiplies by worker count.
      queue: { driver: 'agenda' },
      providers,
      defaultProvider,
      // Sender-domain isolation. Mailery enforces at template-publish time
      // that a template's fromEmail domain matches its kind. Marketing
      // reputation can't bleed onto transactional and vice versa.
      // Subdomains were authenticated via `npx mailery setup-sendgrid`.
      senderDomains: {
        'mail.protokollab.com': { kind: 'transactional' },
        'news.protokollab.com': { kind: 'marketing' },
      },
      publicUrl,
      unsubscribeSecret,
      senderAddress,
      fromDefaults: { name: fromName, email: fromEmail },
    });

    for (const ev of MAILER_EVENTS) {
      try {
        await mailer.registerEvent(ev);
      } catch (err) {
        log.warn({ ...errContext(err), name: ev.name }, 'mailery: registerEvent failed');
      }
    }
    log.info({ events: MAILER_EVENTS.length, provider: defaultProvider }, 'mailery: events registered');

    await mailer.startWorkers();
    log.info({ durationMs: Date.now() - t0 }, 'mailery: workers started');
    return mailer;
  })();

  try {
    return await initPromise;
  } catch (err) {
    log.error(errContext(err), 'mailery: startup failed — disabling');
    disabled = true;
    mailer = null;
    initPromise = null;
    return null;
  }
}

export async function stopMailery() {
  if (!mailer) return;
  try {
    await mailer.stop();
    log.info('mailery: stopped');
  } catch (err) {
    log.warn(errContext(err), 'mailery: stop error');
  } finally {
    mailer = null;
    initPromise = null;
  }
}

// Ensure a contact has a mailer_subscriptions row. Called automatically on
// new-user creation (User.js post('save') hook) and from the backfill
// script. Idempotent — mailery upserts. Source string lands on the row
// for later auditing.
export async function upsertSubscription(externalId, source = 'app') {
  if (disabled || !mailer) return;
  if (!externalId) return;
  try {
    await mailer.upsertSubscription({
      externalId: String(externalId),
      source,
      consentTimestamp: new Date(),
    });
  } catch (err) {
    log.warn({ ...errContext(err), externalId: String(externalId), source }, 'mailery: upsertSubscription failed');
  }
}

// Best-effort fire. Never throws into the caller — email failures can't
// break a request. Returns a promise the caller can await in tests.
export async function fire(name, externalId, properties = null, dedupeKey = null) {
  if (disabled || !mailer) return;
  if (!externalId) return;
  try {
    await mailer.fire(name, String(externalId), properties || undefined, dedupeKey || undefined);
  } catch (err) {
    log.warn({ ...errContext(err), name, externalId: String(externalId) }, 'mailery: fire failed');
  }
}

// Transactional variant — writes the event into the Mailery outbox within
// the same Mongo session as the caller's business writes. The actual
// dispatch only happens if the surrounding transaction commits.
//
// Use at sites where the event MUST NOT leak if the surrounding update
// rolls back (e.g. registration where the User insert + Registered fire
// must be atomic). For best-effort sites, prefer fire().
export async function fireFromSession(session, name, externalId, properties = null, dedupeKey = null) {
  if (disabled || !mailer) return;
  if (!externalId) return;
  try {
    await mailer.fireFromSession(
      session,
      name,
      String(externalId),
      properties || undefined,
      dedupeKey || undefined,
    );
  } catch (err) {
    log.warn({ ...errContext(err), name, externalId: String(externalId) }, 'mailery: fireFromSession failed');
  }
}
