# Testing Strategy

Top-down map of how Protokol Lab is tested, where each test layer runs, and what failure modes it catches. Read this before adding a new test so you put it in the right layer.

> **Looking for "is prod broken right now?"** — that's [Observability](./observability.md).
> This doc covers tests that prove the code is correct *before* deploy and Playwright probes that
> verify the deploy itself succeeded. Sentry, Pino, and the runbook for live incidents live there.

---

## TL;DR

| Layer | Tool | Where it runs | What it proves | When it runs |
|-------|------|---------------|----------------|--------------|
| Server unit/integration | vitest + supertest + mongodb-memory-server | Local + CI (GHA) | Server code correct against ephemeral DB | Pre-deploy (PR + main) |
| Client unit | vitest + happy-dom | Local + CI (GHA) | Store + composable logic correct | Pre-deploy (PR + main) |
| End-to-end | Playwright | Local + CI (GHA) | UI + server wired together correctly against ephemeral DB | Pre-deploy (PR + main) |
| Post-deploy smoke | Playwright (`@synthetic` subset) | GHA, hits **prod** | New deploy actually works in prod | Once per deploy, immediately after `doctl create-deployment` |
| Synthetic monitor | Playwright (`@synthetic` subset) | GHA cron, hits **prod** | Prod is still up + functional between deploys | Hourly, forever |

**Pre-deploy** = catches bugs in your code.
**Post-deploy smoke** = catches "deployed but broken" within seconds of deploy.
**Cron synthetic** = catches drift between deploys (key expiry, third-party outage, DB issue).

All three are needed. Pre-deploy can't hit real prod; smoke can't run without a deploy event; cron alone could leave us blind for up to an hour after a bad deploy.

---

## Why multiple layers

Each layer trades speed against realism:

```
faster ─────────────────────────────────────────► more realistic
unit         integration         e2e         synthetic (prod)
```

- **Unit tests** are fast (~ms) but only prove a function works in isolation. Don't catch wiring bugs.
- **Integration tests** (server route + DB) catch wiring bugs at the route layer but skip the UI.
- **E2E tests** drive a real browser against a real (ephemeral) backend. Catch full-stack wiring. Slow (~seconds per test).
- **Synthetic** runs against actual prod. Only thing that catches "Stripe key expired" or "Mongo cluster degraded."

Rule: write the cheapest test that still proves the thing. Push everything you can down to unit/integration. Reserve e2e for golden paths where the value is end-to-end wiring. Reserve synthetic for prod-only failure modes.

---

## Layer 1 — Server unit / integration tests

**Location:** `server/test/*.test.js`
**Runner:** vitest (`npm run test:server` or `npm test --prefix server`)
**DB:** [`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server) — fresh in-memory Mongo per test run, no install required
**HTTP client:** `supertest` against the Express app
**Setup:** `server/test/setup.js` — mocks third-party services and registers every Mongoose model via `src/models/index.js` (the cascade hook resolves model classes by string name and needs every model loaded).

### What goes here
- Route handlers (auth, foodlog, chat, stripe, etc.)
- Middleware (`requireAuth`, `requireChatQuota`, quota caps)
- Mongoose model behavior, indexes, hooks
- Service-level logic (`services/agent.js`, `services/email.js`) with third-party clients mocked at the module boundary

### What does NOT go here
- UI behavior
- Cross-page user journeys
- Anything that needs a real browser

### Third-party services
Mocked at the module boundary in `setup.js`:
- **Stripe:** mock `stripe` SDK; for webhook tests, generate signed payloads via `stripe.webhooks.generateTestHeaderString` so the real signature path is exercised.
- **Gemini:** mock `services/agent.js` to emit canned SSE chunks.
- **SendGrid:** mock `services/email.js`.
- **S3:** S3 is left unconfigured (`S3_CONFIGURED=false`); the cascade hook and routes branch around S3 cleanly. Tests that need S3 behavior mock `services/s3.js` locally.
- **Web Push:** mock `web-push` send.

### Existing examples
- `server/test/auth.test.js` — register/login/JWT/password reset token gen
- `server/test/crud.ownership.test.js` — row-level access control
- `server/test/stripe.webhook.test.js` — payment events → plan changes
- `server/test/chat.quota.test.js` — quota enforcement math
- `server/test/user.cascade.test.js` — User cascade-delete hook (21 collections + sandboxes + Stripe + S3)
- `server/test/demo.*.test.js` — demo lifecycle (clone, pool, convert, cleanup)

---

## Layer 2 — Client unit tests

**Location:** `client/test/*.test.js`
**Runner:** vitest with happy-dom (`npm run test:client`)
**Framework:** `@vue/test-utils`

### What goes here
- Pinia store logic (mutations, getters, computed totals)
- Composables with non-trivial logic
- Components with complex computed/render behavior in isolation

### What does NOT go here
- Full page navigation
- Anything requiring a real backend

### Existing examples
- `client/test/auth.store.test.js` — auth store state machine
- `client/test/planLimits.test.js` — plan limit calc
- `client/test/upgradeModal.test.js` — upgrade modal trigger logic

---

## Layer 3 — End-to-end (Playwright)

**Location:** `test/e2e/*.spec.js`
**Runner:** Playwright (`npm run test:e2e` or `--ui` for interactive)
**Config:** `playwright.config.js` (root)

### Stack the runner spins up
- Server on `:3002`, `NODE_ENV=e2e`, `USE_MEM_MONGO=1` (fresh in-memory Mongo per `webServer` boot)
- Client (Vite dev) on `:5174`, proxying `/api` → `:3002`
- Headless Chromium (single project, single worker, sequential — `fullyParallel: false`)

### Test-only routes
`server/src/routes/testHelpers.js` exposes `/api/__test/*` endpoints (reset DB, seed demo template, retrieve last password-reset token, etc).

Gated by **two** safeguards:
1. `NODE_ENV=e2e` on the server
2. `x-internal-test-token: e2e-internal-token-not-for-prod` header on every request (auto-injected by Playwright config)

Both must match or the routes 404. This keeps a stray `NODE_ENV=e2e` in CI/staging from exposing destructive endpoints.

### Third-party services in e2e

| Service | E2E strategy | Why |
|---------|--------------|-----|
| **Stripe** | Real test mode (`sk_test_…`) + SDK-signed webhooks | Stripe has a real test mode; exercises real signature verification |
| **Gemini** | Mock agent gated by `AGENT_PROVIDER=mock` env var | No sandbox/test mode; per-token cost on every call |
| **SendGrid** | Sandbox mode (`mail_settings.sandbox_mode.enable: true`) + `__test/last-reset-token` endpoint | Sandbox validates payload without sending; endpoint lets specs read tokens |
| **S3** | Mock at `services/s3.js` | No test mode; not worth real S3 in CI |
| **Web Push** | Mock at boundary | Not worth real push fanout |

### Mock-agent design
When `AGENT_PROVIDER=mock`, `services/agent.js` returns a deterministic SSE stream. Specs can drive scenarios via the `x-mock-scenario` header (`meal-proposal`, `error`, `slow`, etc) so we can test confirm/cancel, error recovery, and abort flows without flake.

### What goes here
- **Golden paths only.** Every spec should represent something a user would notice if it broke.
- Multi-page flows where the value is end-to-end wiring (signup → onboarding → first log)

### What does NOT go here
- Edge case combinatorics (do those in server integration tests — much faster)
- Pure UI rendering (do those in client unit tests)

### `@synthetic` tag — single source of truth for prod monitoring

A subset of e2e specs are tagged `@synthetic`. These run in three places:
1. CI e2e (everything tagged or not)
2. Post-deploy smoke (only `@synthetic`)
3. Hourly cron monitor (only `@synthetic`)

The same Playwright file lives in the repo. When the demo flow changes, the spec changes in the same PR. Drift between "what synthetic monitors check" and "what the app does" is structurally impossible — the next deploy's smoke check fails if the spec is stale.

Tag pattern:
```js
test('demo flow @synthetic', async ({ page }) => { /* ... */ });
test('demo edge case', async ({ page }) => { /* ... */ });  // not synthetic
```
Run synthetic subset: `npx playwright test --grep @synthetic`.

### Existing examples
- `test/e2e/auth.spec.js` — signup, login, logout, guarded routes
- `test/e2e/demo.spec.js` — demo start, toggle, exit, sandbox isolation
- `test/e2e/weight.spec.js` — quick weight log
- `test/e2e/stripe.webhook.spec.js` — payment event → plan upgrade

---

## Layer 4 — Production synthetic monitoring

Two triggers, same `@synthetic` specs.

### 4a. Post-deploy smoke (`.github/workflows/deploy.yml`)
Runs once per deploy, immediately after `doctl apps create-deployment --wait` returns. If it fails, the workflow:
1. Marks itself red.
2. **Auto-rolls back** to the previous active deployment (see "Auto-rollback" below).
3. Alerts (when destinations are wired).

This closes the gap where a deploy succeeds but the app is broken in prod. Without smoke, that gap is up to one cron interval (~1 hour) wide.

### 4b. Cron monitor (`.github/workflows/synthetic.yml`)
Runs the same `@synthetic` specs against `https://protokollab.com` on a schedule, **regardless of deploys**. Catches issues that have nothing to do with code:
- Mongo cluster down / connection limit hit
- Expired API key (Stripe, Gemini, SendGrid)
- TLS cert expiry
- Third-party outage
- DO config drift after a manual dashboard edit
- DNS / CDN issue

**Cadence:** hourly to start (mean-time-to-detect = 1 hour). Tighten to 15 min once we have paying customers / SLA.

### What the synthetic specs do
**Phase 1 — public demo flow** (zero risk to user data):
1. Visit `https://protokollab.com`
2. Click "Try Demo"
3. Log a meal in the demo sandbox
4. Assert the daily total updates
5. Exit demo

Demo sandboxes are isolated by design and auto-clean via the existing `demo.cleanup` Agenda job. No real users see anything.

**Phase 2 — read-only auth probe** (later): permanent `synthetic@protokollab.com` user, login + dashboard load + logout. Catches JWT-cookie / login regressions. No data writes = no cleanup needed.

**Phase 3 — full lifecycle** (only if Phases 1+2 miss real outages): register → onboard → log → verify → delete. Heavier maintenance cost; defer until proven necessary.

### Auto-rollback

DO App Platform supports rollback via API. Pseudo-flow inside `deploy.yml`:

```yaml
- id: capture-prev
  run: |
    PREV=$(doctl apps list-deployments <app-id> --format ID,Phase --no-header \
           | awk '$2=="ACTIVE"{print $1; exit}')
    echo "id=$PREV" >> $GITHUB_OUTPUT

- run: doctl apps create-deployment <app-id> --wait

- id: smoke
  continue-on-error: true
  run: npx playwright test --grep @synthetic

- if: steps.smoke.outcome == 'failure'
  run: |
    doctl apps create-deployment <app-id> \
      --rollback-deployment-id ${{ steps.capture-prev.outputs.id }}
    echo "::error::Smoke failed — rolled back to ${{ steps.capture-prev.outputs.id }}"
    exit 1
```

(Verify exact `doctl` flags when implementing — DO has been renaming these. Capability exists; flag names may differ.)

### Migration discipline (required for safe auto-rollback)
Rolling back the **code** doesn't undo **data** changes. If a deploy ran a Mongo migration and is then rolled back, the old code may break on the new data shape.

**Rule: additive-only migrations by default.**
- Adding a field with a default → safe ✅
- Backfilling data → safe ✅
- Renaming/dropping a field that old code still reads → **unsafe** ❌
- Changing a field's meaning → **unsafe** ❌

For unsafe schema changes, use **two-phase deploys**:
1. Deploy code that reads both old and new shapes.
2. Run the migration.
3. Later deploy that drops support for the old shape.

Each phase is independently rollback-safe. PRs that touch model schemas should declare migration safety in the PR description.

### Alerting (Phase 1)
Workflow goes red on smoke or cron failure. Visible in GHA Actions UI. No email/Slack destination wired yet — that's Phase 2 once we know what real signal vs flake looks like.

---

## User cascade delete + synthetic data hygiene

Every user owns rows across 21 collections plus possibly Stripe and S3 objects. Without a cascade, deleting a user — synthetic, real, or admin-driven — orphans data forever.

### The cascade hook

`server/src/models/User.js` has a `pre('deleteOne', { document: true })` hook that runs whenever a user is deleted via `doc.deleteOne()` (or `findByIdAndDelete`, mirrored). The hook:

1. **Recursively deletes child sandboxes** (any User with `parentUserId === this._id`). Sandboxes have their own data and run their own cascade.
2. **Captures S3 keys** for owned `Photo` and `SupportTicket.attachments` rows before deleting.
3. **Deletes Mongoose rows** in all 21 referencing collections (parallel `deleteMany({ userId })`).
4. **Best-effort S3 cleanup** for the captured keys. Failures log but don't block deletion (orphaned S3 is a janitor problem).
5. **Deletes Stripe customer** if `stripeCustomerId` is set. `resource_missing` is treated as success (already gone). Other errors propagate so the cascade can be retried — the User row stays put on failure.

### Single entry point: `services/userDeletion.deleteUser(userId)`

All production user deletions must route through this:
```js
import { deleteUser } from '../services/userDeletion.js';
await deleteUser(userId);
```
Direct query-level `User.deleteOne({ _id })` does **not** fire the doc-level hook and will silently orphan data.

`User.deleteMany({})` is **intentionally** left alone so test setups can wipe the collection without paying the cascade per row. Tests rely on this for fast isolation between specs.

### Adding a new model with `userId`
**Add it to `CASCADE_COLLECTIONS` in `models/User.js`** — otherwise its rows orphan after deletion. `server/test/user.cascade.test.js` keeps a parallel list and asserts every collection is cleaned, so a missed entry surfaces as a test failure (mirror the list when adding).

### Three-layer synthetic cleanup

Even with the cascade, Phase 2/3 synthetics that create real users in prod need defense in depth:

1. **Per-test cleanup** — each `@synthetic` spec calls `deleteUser()` (via an internal endpoint) in `finally{}`.
2. **Idempotent setup** — each spec wipes any leftover synthetic state before starting (catches a previous run that crashed mid-cleanup).
3. **Background janitor** — Agenda job `synthetic.cleanup`, every 30 min, deletes any user with `metadata.synthetic === true` older than 1 hour. Last line of defense if Layers 1 + 2 fail.

The janitor is itself code that can break silently. It needs:
- A vitest test (`server/test/synthetic.cleanup.test.js`) verifying it deletes the right rows and leaves real users alone.
- A logged metric `synthetic_users_deleted_count` per run. Persistently > 0 means per-test cleanup is failing — fix that, don't lean on the janitor. Stuck at 0 while synthetic specs run means the janitor is broken.

### Tagging convention for synthetic data
Every record created by a synthetic test gets `metadata.synthetic === true`:
- User: `metadata: { synthetic: true }`
- Stripe customer: `metadata: { synthetic: 'true' }` (Stripe metadata is string-only)
- S3 keys: prefix with `synthetic/` so `ListObjects` + `DeleteObjects` can sweep cheaply

---

## CI / CD pipeline

```
┌─────────────────────┐
│ Developer pushes PR │
└──────────┬──────────┘
           ▼
┌─────────────────────────────────────┐
│ .github/workflows/pr.yml            │
│  - server vitest                    │
│  - client vitest                    │
│  - playwright e2e (full suite)      │
│  Branch protection blocks merge     │
│  if any layer fails                 │
└──────────┬──────────────────────────┘
           ▼
       merge to main
           ▼
┌──────────────────────────────────────────────┐
│ .github/workflows/deploy.yml                 │
│  job: test     (same as pr.yml)              │
│  job: deploy   (needs: test)                 │
│    - capture previous active deployment id   │
│    - doctl apps create-deployment --wait     │
│    - playwright --grep @synthetic vs prod    │
│    - on smoke fail: rollback + exit 1        │
└──────────┬───────────────────────────────────┘
           ▼
     DigitalOcean App Platform
     (deploy_on_push: false — gated by GHA)
           ▼
   protokollab.com (live)
           ▲
           │ (every hour, forever)
┌──────────┴──────────────────────────┐
│ .github/workflows/synthetic.yml     │
│  - playwright --grep @synthetic     │
│    vs prod baseURL                  │
│  - on fail: alert (Phase 2)         │
└─────────────────────────────────────┘
```

### Why GHA gates DO deploy (not DO auto-deploy-on-push)
DO's `deploy_on_push: true` deploys every commit to main, including ones with failing tests. We disable it and have GHA call `doctl apps create-deployment` only after tests pass. Single source of truth: "what's in prod" = "last green main run."

The DO app spec lives in DO's dashboard and is mirrored at `.do/app.yaml` for visibility (secrets redacted — DO keeps real values encrypted). App ID: `82fcee11-c0bc-4e54-b0df-75163e543941`.

### Required GHA secrets
- `DIGITALOCEAN_ACCESS_TOKEN` — Personal Access Token with `apps:write` scope, used by `deploy.yml` to trigger DO deployments and rollbacks.

### `@kyneticbio/core` is vendored, not installed from npm

`server/package.json` and `client/package.json` reference `@kyneticbio/core` as `file:../core` (i.e. `log/core`). The package is **not** published to npm — only the GitHub repo at `kyneticbio/core` (public) is the source of truth. Every install therefore needs a local copy of core sitting at `log/core` before `npm install` runs, or it fails with `ERR_MODULE_NOT_FOUND`.

`scripts/ensure-core.mjs` is the single seam that makes this work across environments:

| Where | What it does |
|---|---|
| Local dev (`protokol/{log,core}` siblings) | Symlinks `log/core` → `../core` so edits in the real repo are picked up live without a rebuild dance. |
| GitHub Actions (`test.yml`, `e2e.yml`) | Shallow-clones `kyneticbio/core` into `log/core` and runs `npm ci && npm run build` so `dist/` exists when the inner installs resolve. |
| DigitalOcean (heroku-buildpack-nodejs) | Same as GHA — invoked from the root `heroku-postbuild` script before any `npm install --prefix server\|client`. |

Constraints worth remembering:
- DO's buildpack runs in `/workspace` and the parent directory is read-only. That's why `core/` lives **inside** the repo (`log/core`) rather than as a true sibling — the previous attempt at `file:../../core` failed on DO with `EACCES` writing to `/core`.
- `log/core` is gitignored. Locally it's a symlink; on CI/DO it's a fresh `.git` working tree of core. Neither is tracked by `protokol-lab`.
- `shared/bio/{bloodwork,genetics}Panels.js` reach into `../../core/dist/index.js` directly (relative path, not the package alias) because `log/shared/` has no `node_modules` of its own. If the vendoring path ever moves, those imports must move with it.
- core is **not** a git submodule — there's no tracked SHA pointer, so CI always pulls `kyneticbio/core@main`. Pinning would mean either publishing core to npm or converting to a submodule; today we trade reproducibility for a faster iteration loop.

---

## Environments at a glance

| Env | Where | DB | Third parties | Auth | Test routes (`/api/__test/*`) |
|-----|-------|-----|---------------|------|-------------------------------|
| Local dev | localhost | Real Mongo (env `MONGODB_URI`) | Real test-mode keys | Real | Disabled |
| Server unit/integration | vitest in-process | mongodb-memory-server | All mocked at module boundary | Real (mem) | n/a |
| Client unit | happy-dom | n/a | Mocked | Mocked | n/a |
| E2E | Playwright webServer | mongodb-memory-server | Stripe test mode + Gemini mock + SendGrid sandbox + S3 mock | Real (mem) | **Enabled** (`NODE_ENV=e2e` + token header) |
| Post-deploy smoke | GHA, hits prod after deploy | Real prod Mongo | Real prod (all live) | Demo cookie (Phase 1) | **Disabled** |
| Synthetic cron | GHA cron, hits prod | Real prod Mongo | Real prod (all live) | Demo cookie (Phase 1) | **Disabled** |
| Production | DigitalOcean | Real prod Mongo | Real live keys | Real | **Disabled** |

---

## Where do I put a new test?

Decision tree:

1. **Is it a pure function or store mutation?** → Layer 1 (server) or Layer 2 (client) unit test.
2. **Is it a route handler / middleware / DB interaction?** → Layer 1 server integration test (vitest + supertest + mem-mongo). Default here for most server changes.
3. **Does it require driving the UI through multiple pages?** → Layer 3 e2e — but only if it represents a critical user journey. If you're testing edge cases, push them down to Layer 1.
4. **Is it a golden path that should also run against prod after every deploy + on cron?** → Layer 3 e2e tagged `@synthetic`. Keep it deterministic; flake here causes false rollbacks.
5. **Is it something that can only fail in production (real keys, real DB, real DNS)?** → it's already covered by your `@synthetic` specs. The cron monitor IS the layer.

When in doubt, write it at the lowest layer that can prove the thing. Faster tests run more often and stay green more reliably.

---

## Critical pathways tracked

These are the user-blocking flows we deliberately cover at the e2e + (where applicable) `@synthetic` layer. If a P0 pathway loses coverage, treat it as a regression in the test suite.

### P0 — break = customer cannot use product today
1. Login → authed request
2. Register → onboarding → dashboard reachable
3. Daily food log write
4. Food search / barcode lookup
5. Weight / waist / symptom log
6. AI coach streaming chat
7. Meal proposal confirm/cancel (AI → FoodLog write)
8. Stripe checkout → webhook → plan upgrade
9. Stripe billing portal session
10. Password reset (request → email token → reset → login)
11. Demo → register conversion (demo data preserved)
12. Plan / quota gate (chat quota, storage caps)

### P1 — degrades day, not stop
13. Photo upload (S3 presign)
14. Push notifications (subscribe / preferences)
15. Settings (timezone affects daily macro boundary)
16. Saved meal templates apply
17. Dose log + PK calc
18. Support ticket create → admin reply → user sees reply

### P2 — admin / edge
19. Admin plan override, Stripe sync
20. Demo pool cleanup cron

---

## Running tests locally

```bash
# Everything
npm test                     # server + client unit/integration

# Individual layers
npm run test:server          # vitest, mem-mongo
npm run test:client          # vitest, happy-dom
npm run test:e2e             # playwright, full stack
npm run test:e2e:ui          # playwright interactive UI mode

# Synthetic subset only (against ephemeral mem-mongo, not prod)
npx playwright test --grep @synthetic

# Watch modes
npm run test:watch --prefix server
npm run test:watch --prefix client
```

E2E uses ports `3002` (server) and `5174` (client). If those are in use locally, kill the conflicting processes before running.

---

## When tests fail in CI

1. **Unit/integration failure** — the code change is wrong. Fix the code or the test.
2. **E2E failure** — could be code, could be flake. Playwright is configured `retries: 0` to surface flakes early. If a spec is flaky, fix it (don't add retries).
3. **Post-deploy smoke failure** — auto-rollback already ran. Check the Playwright trace + screenshot in the GHA artifact, identify what's prod-specific (env var, third-party state, migration), fix forward, re-deploy.
4. **Cron synthetic failure** — **prod is broken or degrading**. Check:
   - DO app status
   - Mongo cluster health
   - Recent third-party status pages (Stripe, Gemini, SendGrid)
   - Recent deploys (was something just pushed?)
   - GHA Actions UI for the synthetic run's trace + screenshot

A red synthetic run is a real signal. Don't dismiss it.
