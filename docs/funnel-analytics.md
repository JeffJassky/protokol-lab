# Funnel Analytics

Self-hosted conversion telemetry. Tracks how a visitor moves from
marketing surface → demo → registered user → paid subscription, without
sending data to PostHog, Plausible, Mixpanel, or any other third party.

The runtime cost is one Mongo collection. The maintenance cost is
keeping the funnel-step list in sync with the actual product.

---

## TL;DR

| Layer | Tool | Purpose |
|-------|------|---------|
| Storage | `FunnelEvent` Mongoose collection (180-day TTL) | Single table for every tracked event |
| Server emit | `lib/demoEvents.js`, `lib/funnelEvents.js` | Dual-writes Pino log + DB row |
| Client emit | `composables/useTracker.js` → `POST /api/track` | Page views + CTA clicks |
| Identity | `bo_aid` cookie + register-time stitching | Joins pre-register events to the user |
| Surface | `/admin/funnel` Vue page | Step counts, drop-off %, top UTM sources |

For *how visitors move through the product*, see [Customer Journey](./customer-journey.md).
For *errors and crashes*, see [Observability](./observability.md). This
doc is specifically the conversion-event pipeline.

---

## Why self-hosted

The decision was deliberate. Tradeoffs we accepted:

| Cost of DIY | Why we paid it |
|-------------|----------------|
| ~1 day of build | Stack already had admin auth + Mongo aggregation patterns |
| No session replay | We have Sentry replay (errors only) |
| No heatmaps | Don't need them yet; CTA `surface` tag is granular enough |
| No bot filter | UTM-tagged traffic only on the funnel page mitigates |
| 180-day retention cap | Long-tail analysis is a warehouse problem, not an in-app one |

What we got:

- **Zero data leaving our infra.** Stripe-style event collection without
  shipping user behaviour to a third party.
- **Native joins** with `User`, `ChatUsage`, Stripe billing data inside
  the same admin UI.
- **No new vendor.** No additional bill, no SDK update churn, no extra
  consent banner.

If we ever need cohorts / retention / replay at the funnel level, the
right move is to add PostHog *alongside* (acquisition + replay) and
keep this store for in-app conversion math. Don't migrate.

---

## Data model

### `FunnelEvent` collection

Defined in `server/src/models/FunnelEvent.js`.

| Field | Type | Notes |
|-------|------|-------|
| `name` | string, indexed | One of the canonical step names — see below |
| `anonId` | string, indexed | Long-lived browser identifier (`bo_aid` cookie). Survives demo→register. |
| `userId` | ObjectId\|null, indexed | Set when authed, or backfilled at register-time stitching |
| `sandboxId` | ObjectId\|null | Demo sandbox the user was in (anon demo events) |
| `props` | Mixed | Free-form dimensions. Capped at 16 keys × 200 chars in `clampProps()` |
| `utmSource` / `utmMedium` / `utmCampaign` | string\|null | First-touch attribution |
| `path` | string\|null | URL path at emit time (client beacons only) |
| `referrer` | string\|null | First-touch referrer (client beacons only) |
| `ua`, `ip` | string\|null | Coarse forensics |
| `ts` | Date, **180-day TTL** | Auto-expired by Mongo TTL index |

Compound indexes: `(name, ts -1)`, `(userId, ts -1)`, `(anonId, ts -1)`.
Tuned for the three queries that actually run: funnel aggregation, per-user
timeline, anon→user backfill.

### Allowlists

`server/src/lib/funnelEvents.js` is the single source of truth for both
*what events the client beacon may emit* and *what steps the funnel page
counts in order*. Two exports:

```js
// Names the client beacon will accept. Server-side emits aren't gated.
export const CLIENT_EVENT_ALLOWLIST = new Set([
  'page_view',
  'cta_click',
  'demo_feature_click',
  'pricing_plan_select',
  'signup_form_start',
  'signup_form_submit',
]);

// Canonical step ordering. Drives /admin/funnel.
export const FUNNEL_STEPS = [
  'page_view',
  'cta_click',
  'demo_start',
  'demo_signup_convert',
  'onboarding_complete',
  'subscription_started',
];
```

**Edit both lists in lockstep with the customer journey.** A new step
that isn't in `FUNNEL_STEPS` won't show on the admin page; a new client
event that isn't in the allowlist gets a 400.

---

## Emit paths

### Server-side: `emitDemoEvent(req, name, props)`

Defined in `server/src/lib/demoEvents.js`. Used for events that originate
on the server — demo lifecycle, signup conversion, Stripe webhooks.

Each call:

1. Writes a Pino `info`-level line (canonical record for log search).
2. Inserts a `FunnelEvent` row via `insertFunnelEvent()` (best-effort,
   never throws).

Call sites today:

| Event | Source | Where |
|-------|--------|-------|
| `demo_start` | Anon visitor mints sandbox | `routes/demo.js#POST /start` |
| `demo_signup_convert` | Anon-with-demo registers | `routes/auth.js#POST /register` |
| `demo_feature_click` | In-demo wow-feature interaction | `routes/demo.js#POST /event` |
| `onboarding_complete` | Wizard finished | `routes/auth.js#POST /onboarding/complete` (uses `insertFunnelEvent` directly — no Pino dual-write since onboarding completion isn't a "demo" event) |
| `subscription_started` | First successful Stripe checkout | `routes/stripe.js#onCheckoutCompleted` |

### Client-side: `useTracker()` + `POST /api/track`

`client/src/composables/useTracker.js` exports two surfaces:

- **`installTrackerAutoPageView(router)`** — called once at boot in
  `client/src/main.js`. Fires `page_view` on every router `afterEach`.
- **`track(name, props)`** — manual emit. Used in CTAs and form
  start/submit handlers.

Transport prefers `navigator.sendBeacon` so navigations don't cancel the
request. Falls back to `fetch` with `keepalive: true` if sendBeacon
isn't available.

The route `POST /api/track` lives in `server/src/routes/track.js`. It:

- Is **public** (marketing pages have no session).
- Rate-limits at 60 requests / minute / IP.
- Validates `name` against `CLIENT_EVENT_ALLOWLIST`.
- Resolves `userId` opportunistically from the JWT cookie if present,
  otherwise leaves it `null` (anonId carries identity).
- Returns `204` and ignores the response client-side.

### First-touch attribution

UTM params and `document.referrer` are snapshotted on first page load
and stored in `localStorage` (`bo_initial_utm`, `bo_initial_referrer`).
Subsequent navigations reuse the stored values. Without this, an
internal nav from `/?utm_source=twitter` to `/dashboard` would lose the
Twitter attribution.

---

## Identity model

### Anonymous identifier

`server/src/middleware/anonId.js` reads/sets a long-lived cookie
`bo_aid`:

- 16 bytes random, base64url, ~128 bits entropy
- 2-year `Max-Age`
- `httpOnly`, `sameSite: lax`, `secure: true` in prod
- Set on every request that doesn't already have it (effectively: first
  request from a fresh browser)
- Available as `req.anonId` for downstream handlers

Not a tracking super-cookie: not derived from PII, not synced beyond the
event store, cleared by clearing site cookies.

### Stitching at register time

`routes/auth.js#stitchAnonToUser` runs in **register**, **login**, and
**Google sign-in**. It backfills `userId` onto every `FunnelEvent`
matching the current `anonId`:

```js
await FunnelEvent.updateMany(
  { anonId, userId: null },
  { $set: { userId } },
);
```

After this runs, a `/pricing → demo → register` sequence is queryable
by the new user's `_id`. Without it, the anon and authed halves of one
user's journey would never join.

The stitch is best-effort: a Mongo blip can never break the auth flow.

---

## Admin surface

### `/admin/funnel`

`client/src/pages/AdminFunnelPage.vue` calls `GET /api/admin/funnel?days=N`.

The endpoint (`routes/admin.js`):

1. For each step in `FUNNEL_STEPS`, runs a `$facet` branch that counts
   distinct visitors (`anonId` first, falling back to `userId.toString()`
   for server-only events).
2. Computes `dropFromPrev` (% lost vs the previous step) and
   `conversionFromTop` (% of step 0 visitors that reached this step).
3. Returns the top 10 UTM sources by `page_view` visitor count.

Output is a horizontal bar chart, one row per step, with conversion %
and drop-off %.

### Per-user timeline

`GET /api/admin/users/:userId` includes a `funnelEvents` array (last 50
events for that user). Surfaced on `AdminUserDetailPage.vue` as a table
with `ts`, `name`, `path`, `utm.source`, `props`. Useful for
"why didn't this user convert?" investigations.

---

## Adding a new step or event

### A new client-side event

1. Add the name to `CLIENT_EVENT_ALLOWLIST` in `lib/funnelEvents.js`.
2. Call `track('your_event_name', { …props })` from the relevant
   component. Use `useTracker()` if you're inside `<script setup>`,
   or import `track` directly.
3. Cardinality: keep `props` keys low-cardinality (booleans, enums, IDs)
   and free of PII. The clamp helper trims at 16 keys × 200 chars but
   doesn't enforce the *kind* of value.

### A new funnel step

1. Add the canonical event name to `FUNNEL_STEPS` (in canonical order).
2. Wire the emit at the actual call site. Server emits use
   `insertFunnelEvent` (or `emitDemoEvent` if the event also belongs on
   the demo Pino feed). Client emits go through the beacon.
3. Update [Customer Journey §2](./customer-journey.md) in the same PR
   so the two docs don't drift.
4. The admin page picks up the new step automatically — no UI change
   needed.

### A new CTA surface

We tag every `cta_click` with `{ cta, surface }` so the funnel page can
break clicks down by where on the marketing site they came from. Current
surfaces:

| Surface tag | Component |
|-------------|-----------|
| `nav` | `MarketingLayout.vue` top nav |
| `hero` | `LandingPage.vue` hero CTAs |
| `landing_end` | `LandingPage.vue` final CTA |
| `pricing_free` / `pricing_premium` / `pricing_unlimited` | Pricing card buttons |
| `end_cta` | `MarketingEndCta.vue` (default — overridable via prop) |

Add new surfaces by passing `{ surface: 'your_surface' }` to either
`tryDemo()` (the `useTryDemo` composable accepts it) or `track('cta_click', …)`
directly.

---

## Operational notes

### Retention

180-day TTL on `ts`. Mongo's TTL monitor runs once a minute and deletes
expired rows. Long-tail analysis (year-over-year cohorts) is a warehouse
problem, not an in-app one — export to BigQuery / DuckDB if/when we
need it.

### Sampling

We don't sample. The free Mongo cluster handles current event volume
without strain. If `FunnelEvent` outgrows the cluster, the first move is
sampling at the beacon: drop `page_view`s above some rate, keep
conversion events 100%.

### Bot traffic

Headless / scripted traffic inflates `page_view` counts. Mitigations
already in place:

- The `/admin/funnel` UTM panel only counts `page_view`s that arrived
  with a UTM tag, so direct bot crawlers don't pollute attribution.
- Beacon rate-limit caps a single IP at 60/minute.

If the funnel headline number starts looking implausible, add a
`User-Agent` allowlist filter in the aggregation match stage.

### Schema migrations

`FunnelEvent.props` is `Mixed`. Adding a new key requires no migration.
Adding a new top-level field does — and the safest path is additive:
field starts as optional, code reads "old or new", later cleanup drops
the old shape. This matches the migration discipline in
[Testing §Migration discipline](./testing.md#migration-discipline-required-for-safe-auto-rollback).

### Privacy

- `bo_aid` is `httpOnly` so JS can't exfiltrate it.
- Beacon payloads carry `path`, `referrer`, UTM, props — never raw form
  values, never email, never passwords. Allowlist-gated names mean a
  rogue caller can't invent a `password_typed` event.
- Sentry's PII redaction (`sendDefaultPii: false`) doesn't apply to
  this collection because we're not sending to Sentry. Treat
  `FunnelEvent` as PII-free by construction; review every new prop key
  with that assumption.

---

## Tests

`server/test/funnel.test.js` covers:

- Beacon rejects unknown event names.
- Beacon persists allowlisted events tagged with the request's `anonId`.
- `demo_start` dual-writes a `FunnelEvent` row when `/api/demo/start`
  succeeds.
- Anon→user stitching backfills prior events at register time.
- `/api/admin/funnel` produces correct step counts and drop-off %.

Adding a new step? Add a test that asserts it appears in the aggregation
output. The aggregation logic is the high-leverage piece — it's the
bit a reader of "did our funnel change?" actually trusts.

---

## See also

- [Customer Journey & CTA Map](./customer-journey.md) — what the funnel
  steps mean from the visitor's perspective.
- [Observability](./observability.md) — Pino logs and Sentry. Different
  systems; this doc is for *clicked the button*, that one is for
  *the button broke*.
- [Testing Strategy](./testing.md) — how the pipeline is verified
  pre-deploy.
