# Observability

How we know what production is doing — logs, errors, performance traces,
and how the pieces relate to the test layers documented in
[Testing Strategy](./testing.md).

Three concerns live here:

| Concern | Tool | Where |
|---------|------|-------|
| Structured logs | [Pino](https://getpino.io) | Server stdout → host log shipper |
| Error reporting | Sentry | https://jeff-jassky.sentry.io |
| Synthetic uptime | Playwright `@synthetic` | See [Testing §4](./testing.md#layer-4-production-synthetic-monitoring) |

Pino tells us *what happened*. Sentry tells us *why something broke*.
Synthetic monitors tell us *whether prod is alive between deploys*. All
three are required: logs alone won't surface client-side crashes; Sentry
alone won't show a Mongo cluster going degraded between deploys; synthetic
alone gives a one-hour blind window after each deploy.

---

## TL;DR

1. **Server crash / 5xx** → Sentry `protokollab-server` issue feed.
2. **Browser crash / Vue runtime error** → Sentry `protokollab-client`
   issue feed (with session replay).
3. **"What happened to user X at 14:32"** → Pino logs by `userId` /
   `requestId`. Sentry breadcrumbs include the request id when both
   are wired in the same request.
4. **"Is prod up right now?"** → GHA Actions → `synthetic.yml` workflow.

---

## Sentry

### Account structure

```
Organization: jeff-jassky
└── Team: protokollab
    ├── Project: protokollab-server   (Node — Express + Mongoose + scheduler)
    └── Project: protokollab-client   (Vue SPA — browser SDK + replay)
```

**One project per runtime, not per app.** Server stack traces, browser
stack traces, source-map handling, and alert rules all diverge. Mixed
projects make issue grouping wrong and alerting noisy.

When we add new services, the convention is `<app>-<component>`:

| Suffix | What |
|--------|------|
| `-server` | HTTP API / web backend |
| `-client` | Browser SPA |
| `-worker` | Background jobs, schedulers, queue consumers |
| `-mobile-ios` / `-mobile-android` | Native apps |
| `-marketing` | Standalone marketing site if separate from app SPA |
| `-edge` | Cloudflare worker / lambda@edge |

### Environments

Environments are an SDK-side **tag**, not a separate project. Same DSN,
different `environment:` value at init. Allowed values:

| Value | Where it runs |
|-------|---------------|
| `local` | Developer machine |
| `dev` | Ephemeral integration env (when we have one) |
| `staging` | Preview / pre-prod |
| `production` | DigitalOcean App Platform |

Sentry materializes the environment on first event. No API call needed
when adding a new one — just set `SENTRY_ENVIRONMENT` (server) or
`VITE_SENTRY_ENVIRONMENT` (client) on the host config.

### Server SDK (`@sentry/node`)

- `server/src/instrument.js` initializes the SDK.
- Imported as the **first non-`dotenv` line** in `server/src/index.js`.
  `@sentry/node` patches `http`, Express, Mongoose, and other Node
  internals at import time. Modules loaded before this line are not
  instrumented.
- `Sentry.setupExpressErrorHandler(app)` in `server/src/app.js` runs
  after routes and before our final error handler.
- Process-level `uncaughtException` / `unhandledRejection` handlers in
  `index.js` `await Sentry.close(2000)` before exit, so an in-flight
  event reaches Sentry before the process terminates.
- `beforeSend` redacts `cookie`, `authorization`, and the `token` /
  `bo_aid` / `demoSession` cookie values.
- No-op when `SENTRY_DSN` is unset → tests, CI, and dev-without-credentials
  work normally.

### Client SDK (`@sentry/vue` + `@sentry/vite-plugin`)

- `client/src/sentry.js` exports `initSentry(app, router)`.
- Called in `client/src/main.js` after `createApp`, before `app.mount`.
- Integrations enabled:
  - `browserTracingIntegration({ router })` — Vue Router breadcrumbs +
    page-load / route-change spans.
  - `replayIntegration` — session replay, `maskAllText: true`,
    `maskAllInputs: true`, `blockAllMedia: true`. PII is masked by default.
- Sample rates (free-tier-safe):
  - `replaysSessionSampleRate: 0.1` — 10% of normal sessions
  - `replaysOnErrorSampleRate: 1.0` — 100% of error sessions
  - `tracesSampleRate: 0` (override via `VITE_SENTRY_TRACES_SAMPLE_RATE`)
- `tracePropagationTargets: ['localhost', /^\//]` — trace headers only
  go to our own backend, not to Stripe/Google/etc.
- `@sentry/vite-plugin` uploads source maps at build when
  `SENTRY_AUTH_TOKEN` is present. Locally, leave it blank — the plugin
  no-ops via `disable: !sentryEnabled`.

### Environment variables

#### Server (`server/.env`)

| Var | Purpose | Default |
|-----|---------|---------|
| `SENTRY_DSN` | Project DSN. Empty string → SDK no-ops. | unset |
| `SENTRY_ENVIRONMENT` | `local` / `dev` / `staging` / `production` | falls back to `NODE_ENV` then `local` |
| `SENTRY_RELEASE` | Tag events with a release. Match the client. | unset |
| `SENTRY_TRACES_SAMPLE_RATE` | 0–1; default 0 (no perf events). | `0` |

#### Client (`client/.env.local` and host build env)

| Var | Purpose | Default |
|-----|---------|---------|
| `VITE_SENTRY_DSN` | Browser project DSN. Exposed to bundle. | unset |
| `VITE_SENTRY_ENVIRONMENT` | Same vocabulary as server. | `local` (`production` when `import.meta.env.PROD`) |
| `VITE_SENTRY_RELEASE` | Match the server's release tag. | unset |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | 0–1; default 0. | `0` |

#### Build-time (CI / Heroku / DO)

| Var | Purpose |
|-----|---------|
| `SENTRY_AUTH_TOKEN` | Token with `project:releases` scope. Drives source-map upload via `@sentry/vite-plugin`. **Never commit.** Issued at https://jeff-jassky.sentry.io/settings/account/api/auth-tokens/. |
| `SENTRY_ORG` | `jeff-jassky` |
| `SENTRY_PROJECT` | `protokollab-client` (Vite plugin scope; server doesn't need it) |

### Releases

A release is the unit Sentry uses to compute "first seen in" and to attach
source maps. Recipe per deploy:

```bash
# In your CI / deploy pipeline (Heroku release phase or GHA job)
RELEASE="protokollab@${GIT_SHA}"
export SENTRY_RELEASE="$RELEASE" VITE_SENTRY_RELEASE="$RELEASE"
sentry release create "jeff-jassky/$RELEASE" --project protokollab-server
sentry release create "jeff-jassky/$RELEASE" --project protokollab-client
sentry release set-commits "jeff-jassky/$RELEASE" --auto
# build + upload source maps happens here (Vite plugin reads SENTRY_AUTH_TOKEN)
sentry release finalize "jeff-jassky/$RELEASE"
sentry release deploy "jeff-jassky/$RELEASE" production
```

Use the **same** release name across both projects. That's how Sentry
joins a Vue error to the Express request that originated it.

### What we don't capture

By design:

- **Logs** are not shipped to Sentry. Pino → host stdout is sufficient.
  Sentry's value is errors, not log search.
- **PII**. `sendDefaultPii: false` on both SDKs; replay masks all
  text/inputs; `beforeSend` strips auth headers.
- **Trace spans by default.** `tracesSampleRate` defaults to `0`. Bump
  per-env when we want performance data; the per-event cost is real on
  the free tier.

### Verifying it works

```bash
# Server: send a test event
cd server && node --input-type=module -e "
  import 'dotenv/config'; import './src/instrument.js';
  import * as S from '@sentry/node';
  S.captureException(new Error('test'));
  await S.close(5000);
"

# Confirm it landed
sentry api /api/0/projects/jeff-jassky/protokollab-server/issues/ \
  | jq '.[0].title'
```

For client errors, run `npm run dev` and `throw new Error('test')` in the
browser console — the SDK is initialized once `main.js` mounts.

### Common pitfalls

- **Importing `@sentry/node` after other modules.** The integrations
  patch built-ins at import time. If your new file imports `mongoose`
  before `instrument.js`, those queries won't appear in traces. Always
  import `./instrument.js` first.
- **Unhandled-rejection masking.** Our `process.on('unhandledRejection')`
  handler must `await Sentry.close()` before `process.exit(1)` or the
  event never makes it. The handler in `index.js` already does this.
- **Forgetting source maps in CI.** If `SENTRY_AUTH_TOKEN` isn't set
  during `vite build`, prod stack traces are minified gibberish. The
  plugin emits a warning but doesn't fail the build.
- **Mismatched releases.** If the server tags `protokollab@abc123` and
  the client tags `1.2.3`, distributed tracing across projects looks
  broken. Use one variable, set it on both.

---

## Pino logs

Structured JSON logs from the Express server. The shipper / aggregator
(stdout → host → log service) is platform-specific; this section is just
the source-side conventions.

### Configuration

- `server/src/lib/logger.js` constructs the root logger with
  `LOG_LEVEL` (`silent` in tests, `info` in prod, `debug` for verbose
  local).
- `httpLogger` (pino-http) attaches `req.log` per request with a
  generated `req.id`.
- `childLogger(component)` creates a sub-logger tagged
  `{ component: '<name>' }` so feed filters work consistently.

### What gets logged

| Level | Use for |
|-------|---------|
| `fatal` | Process is exiting. `uncaughtException`, `unhandledRejection`. |
| `error` | Request failed in a way the user notices, or a background job died. Always include `errContext(err)`. |
| `warn` | Something unexpected but recovered. Rate-limit hits, stale tokens, missed webhooks. |
| `info` | One line per significant business event: register, login, demo start, payment, plan change, cron run. |
| `debug` | Local-only detail. `LOG_LEVEL=debug` to surface. |
| `trace` | Almost never. Use a debugger instead. |

### Conventions

- **Fields, not interpolation.** `log.info({ userId, plan }, 'plan changed')`
  not `log.info(\`plan changed for ${userId}\`)`. Structured filters are
  the entire point of Pino.
- **`errContext(err)` always.** Defined in `server/src/lib/logger.js`.
  Captures `code`, `name`, `message`, `stack` in a single object so
  errors aggregate properly downstream.
- **Lowercase, snake_case event names.** `log.info({ event: 'demo_start' }, 'demo: started')`.
  This matches the `event:` tag pattern used by `lib/demoEvents.js`.
- **No PII in info-level lines.** Email is OK in `register` / `login`
  events because we already store it; raw passwords, JWTs, tokens are not.

### Pino vs Sentry

They are not redundant. Rule of thumb:

- A line that says "this user did X" → **Pino**.
- A line that says "we crashed and need a human" → **Sentry**.
- The same incident often produces both. That's correct. The Sentry
  issue links to the timestamp; Pino has the surrounding request
  context.

The Sentry SDK already attaches the request URL, method, and headers to
captured errors via the http integration. We don't need a `Sentry.addBreadcrumb`
call at every Pino line; Sentry's own console-capture integration picks
up unhandled errors that flow through the Express error handler.

---

## Client-side telemetry, not errors

For acquisition / conversion funnel events (page views, CTA clicks,
demo starts), see [Funnel Analytics](./funnel-analytics.md). That's a
different system: business signals, not error reporting. Sentry is for
"the page broke"; the funnel store is for "the user clicked".

---

## Runbook

### "Prod feels broken"

1. **Sentry issue feed** for the affected project (server / client).
   Filter `is:unresolved environment:production`. New issue in the last
   hour is the smoking gun 80% of the time.
2. **GHA `synthetic.yml`** last run. Red cron run = the demo flow is
   broken in prod. The Playwright trace artifact shows where.
3. **Pino logs** by `userId` if we have a specific user complaint. Look
   for the matching `req.id` to thread the whole request.

### "Sentry stopped receiving events"

1. Check `SENTRY_DSN` is set on the running process (Heroku config /
   DO env vars). An empty DSN silently no-ops.
2. Run a smoke event from the host (`Sentry.captureException(new Error('probe'))`).
3. Check Sentry dashboard → Stats → Outcomes for the project. Rate-limited
   or filtered events show here.
4. Check `SENTRY_AUTH_TOKEN` hasn't expired (Sentry rotates user tokens
   yearly). If it has, source-map uploads will be silently failing —
   prod stack traces look like minified soup.

### "Synthetic alert fired but app looks fine"

See [Testing §When tests fail in CI](./testing.md#when-tests-fail-in-ci)
case 4. Don't dismiss it; verify by hand.

---

## See also

- [Testing Strategy](./testing.md) — pre-deploy correctness, post-deploy
  smoke, hourly synthetic. The cron monitor is the only layer that runs
  in production after a deploy completes.
- [Funnel Analytics](./funnel-analytics.md) — the in-app FunnelEvent
  store for conversion telemetry. Different system, different purpose.
- [Customer Journey & CTA Map](./customer-journey.md) — what the user
  actually does when an error happens, which is what makes a Sentry
  issue actionable.
