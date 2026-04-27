# Customer Journey & CTA Map

The authoritative inventory of how a visitor enters the product, what paths
exist between each state, and which CTA belongs in which surface. Update
this any time a marketing CTA, signup form, or demo route changes — drift
between "what the doc says" and "what the buttons do" causes the kind of
fragmentation that motivated this file.

---

## 1. Visitor states

Every visitor is in exactly one of these states at any moment. The CTAs
visible to them must match the state — showing "Try the demo" to someone
already in the demo is noise; showing "Sign up" to a logged-in user is
worse than noise.

| State | JWT cookie | Demo cookie | `auth.user` | `demo.mode` | Lives in |
|-------|------------|-------------|-------------|-------------|----------|
| **Anon visitor** | — | — | null | `'none'` | Marketing pages |
| **Anon demo** | — | ✓ | null | `'anon'` | App (sandbox-scoped) |
| **Authed user** | ✓ | — | real | `'authed'`, no `sandboxId` | App (real data) |
| **Authed in demo** | ✓ | — | real | `'authed'`, `sandboxId` set | App (sandbox-scoped) |
| **Authed mid-wizard** | ✓ | — | real, `onboardingComplete=false` | `'authed'` | `/welcome` only |

Anon demo and authed-with-toggle both have an "active sandbox profile"
that data routes scope to. The session-split middleware
(`server/src/middleware/requireAuth.js`) resolves `req.userId` (data
scope) and `req.authUserId` (auth identity) accordingly.

---

## 2. Canonical conversion paths

Five paths in total. Every CTA on every page should funnel into one of
these — if you find yourself inventing a sixth, push back and reuse one.

### A. Cold → Demo → Real account
The flagship cold-traffic path. PRD §6.1.

1. Marketing page → click **"Try the demo"** → `POST /api/demo/start`
2. Server mints anon sandbox (or claims a pooled one), sets demo cookie
3. Redirect to `/dashboard` — full app chrome, demo banner expanded
4. Visitor explores; banner offers **"Set Up My Profile"** → `/start`
5. `/start` collects email + password + compound + dose + date (3-field minimum)
6. On submit: `POST /api/auth/register` (drops demo cookie, emits `demo_signup_convert`), then `POST /api/compounds`, `POST /api/doses`, `POST /api/auth/onboarding/complete`
7. → `/dashboard` (real account, fully onboarded)

### B. Cold → Free signup (no demo)
Visitor knows what they want; doesn't need the demo.

1. Marketing page → click **"Sign up"** / **"Get started free"** → `/register`
2. Email + password
3. `POST /api/auth/register` → `/welcome` (8-field wizard) → `/log`

### C. Cold → Paid trial signup
Visitor selected a paid plan from pricing. Plan intent preserved through the funnel.

1. Pricing card → **"Start 14-day free trial"** → `/register?plan={premium|unlimited}&interval={monthly|yearly}`
2. Email + password (CTA copy: "Continue to checkout →")
3. `POST /api/auth/register`
4. `startCheckout(planId, interval)` → Stripe-hosted checkout
5. Stripe redirects → `/settings?session_id=...`

### D. Existing user → Login
1. Top nav **"Sign in"** → `/login`
2. Email + password (or Google)
3. → `/log` (or, if `?plan=` carried in via login URL: → Stripe checkout)

### E. Authed user → Toggle into demo
PRD §6.2. Retention pattern: new users with sparse data flip over to see "what this becomes."

1. Logged in, viewing real data → corner badge **"View Jeff's demo"** → `POST /api/demo/enter`
2. Server creates parented sandbox (reused on subsequent toggles) + sets `user.activeProfileId`
3. App now reads sandbox data; in-demo banner shows **"Exit"** + **"Reset"**

---

## 3. CTA placement convention

Marketing surfaces should always offer **primary**, **secondary**, and
optionally **tertiary** CTAs in this order. Anything else is noise.

| Surface | Primary | Secondary | Tertiary |
|---------|---------|-----------|----------|
| **Top nav (marketing)** | Try the demo | Sign up | Sign in |
| **Hero (landing)** | Try the demo | Sign up | Sign in |
| **Pricing card — Free** | Get started | — | — |
| **Pricing card — Premium / Unlimited** | Start 14-day free trial | — | — |
| **Mid-funnel CTA section (Features, AI, Compounds)** | Try the demo | Sign up free | — |
| **End-of-page CTA (long marketing pages)** | Try the demo | Sign up free | — |
| **App top nav (authed)** | (nav links) | — | Logout / Exit demo |
| **Demo banner expanded (anon)** | Set Up My Profile | Keep Exploring | — |
| **Demo banner collapsed (anon)** | Set Up Profile → | (expand button) | — |
| **Demo badge (authed, no toggle)** | View Jeff's demo | — | — |
| **Demo badge (authed, in demo)** | Exit | Reset | — |

Rules of thumb:
- **One primary per screen.** A page with three "primary" buttons has zero.
- **Demo before signup, always.** Cold conversion to demo is friction-free; cold conversion to signup leaks 5–15% per field.
- **Hide primary CTAs from logged-in users.** A logged-in visitor seeing "Sign up" wastes the slot — replace with the next stage of their journey (e.g. their dashboard, the upgrade modal).

---

## 4. URL parameters reference

Everything that changes behavior via the URL. If you add a new param,
document it here.

| Param | Used on | Values | Effect |
|-------|---------|--------|--------|
| `?plan=` | `/register`, `/login` | `premium`, `unlimited` | After successful auth, immediately routes to Stripe checkout for that plan instead of `/log`. CTA copy on the form switches to "Continue to checkout →". |
| `?interval=` | `/register`, `/login` | `monthly`, `yearly` | Billing frequency for the Stripe checkout. Required if `?plan=` is present. |
| `?email=` | `/start` | Any email | Pre-fills the email field. Used for cold-email magic links per PRD §14. |
| `?utm_source=` | Any page | Any string | Captured in `demo_start` event for funnel attribution. |
| `?utm_medium=` | Any page | Any string | Same. |
| `?utm_campaign=` | Any page | Any string | Same. |
| `?session_id=` | `/settings` | Stripe session id | Surfaced post-checkout for receipt UI. |
| `?checkout=` | `/settings` | `success`, `cancel` | Result of a Stripe checkout, drives a banner. |
| `?date=` | `/log` | `YYYY-MM-DD` | Sets the visible day in the food log. |

---

## 5. Per-page audit

Current state of every CTA surface. ✅ aligned with §3. ⚠ still open —
collected at the end of this section.

### `/` — LandingPage.vue
- ✅ Hero: "Try the demo" (primary), "Sign up" (secondary), "Sign in" (tertiary)
- ✅ Pricing cards: per-plan trial CTAs with `?plan=&interval=`
- ✅ End-of-page CTA pair: "Try the demo →" + "Sign up free"

### MarketingLayout.vue (top nav across all marketing pages)
- ✅ Anon visitors: "Try the demo" (primary), "Sign up" (secondary), "Sign in" (tertiary)
- ✅ Authed users + demo sessions: single "Open app" CTA

### `/pricing` — PricingPage.vue
- ✅ Per-plan CTAs route correctly with `?plan=&interval=`
- ⚠ Free-tier card "Get started" is bare `/register` — fine, but consider whether that should also offer "Try the demo" since the visitor is in evaluation mode

### `/features` — FeaturesPage.vue
- ✅ End CTA pair: "Try the demo →" + "Sign up free"

### `/ai` — AiPage.vue
- ✅ End CTA pair: "Try the demo →" + "See pricing"

### `/compounds` — CompoundsPage.vue
- ✅ End CTA pair: "Try the demo →" + "Sign up free"

### `/blog`, `/blog/*`, `/compare`, `/faq`, `/about`
- ✅ All use the shared `<MarketingEndCta>` component (`client/src/components/MarketingEndCta.vue`).
- BlogArticle.vue mounts MarketingEndCta automatically below every post.
- **Note:** per-blog `template #cta` slots in 6 blog pages are now dead code (slot was removed from BlogArticle). Safe to delete on next pass.

### `/register` — RegisterPage.vue
- ✅ Honors `?plan=&interval=` to preserve checkout intent
- ✅ Cross-link to `/login` carries plan/interval through

### `/start` — StartPage.vue
- ✅ Honors `?email=`
- ⚠ Doesn't honor `?plan=&interval=` — a demo visitor who saw a pricing card and clicked "Set Up My Profile" can't carry trial intent through. Probably acceptable for v1; revisit if telemetry shows demo→trial as a real path.

### `/login` — LoginPage.vue
- ✅ Honors `?plan=&interval=` for post-login Stripe redirect
- ✅ Cross-link to `/register` carries plan/interval through

### `/welcome` — WelcomePage.vue (8-field wizard)
- Only reached by users who registered without `/start`
- No marketing CTAs (intentional — it's the onboarding flow)

### App — DemoBanner.vue
- ✅ Anon expanded: "Set Up My Profile" + "Keep Exploring"
- ✅ Anon collapsed: "Set Up Profile →"
- ✅ Authed (no toggle): "View Jeff's demo"
- ✅ Authed (in demo): "Exit" + "Reset"

### App — AppLayout.vue (authed top nav)
- ✅ Logout/Exit-demo button is context-aware

### Still open

Minor items worth closing in a future pass — none are user-visible bugs:

1. **Pricing Free-tier card** — "Get started" routes straight to `/register`. Consider adding a "Try the demo" secondary on that card too, since the visitor is in evaluation mode. Decide based on conversion data once funnel events are flowing.
2. **`/start` doesn't honor `?plan=&interval=`** — a visitor who saw a pricing card → started a demo → clicked "Set Up My Profile" loses trial intent. Acceptable for v1; revisit if telemetry shows demo→trial as a real path.
3. **Dead `template #cta` slots in 6 blog pages** — `BlogArticle.vue` no longer exposes that slot, so the per-page overrides do nothing. Safe to delete next time we touch each post.

---

## 6. Anti-patterns to avoid

These are mistakes we've made or nearly made — call them out in PR review.

- **Two primaries on one screen.** "Try the demo" + "Start free trial" both styled as the brand-color primary button. Pick one per screen; the other is secondary.
- **Plan-gated CTAs that drop intent.** Any "Start trial" button must carry `?plan=` + `?interval=` so the param survives the auth round-trip into Stripe.
- **Free-tier signup with "trial" copy.** "Start free trial" implies a paid plan with a trial period. The Free plan has no trial. Use "Get started" or "Sign up free."
- **Auto-redirecting demo sessions to `/log` from `/`.** This makes marketing unreachable from inside the demo. Brand logo and `<router-link to="/">` should land on the actual landing page; only auto-redirect logged-in (real-account) users.
- **Showing onboarding install/notification nudges in demo.** Sandbox users can't receive push and have nothing to "install"; suppress these (`OnboardingChecklist`, `OnboardingBanner`) when `demo.inDemo`.
- **Showing upsells in demo.** Sandbox plan is `unlimited`; `usePlanLimits` and `upgradeModal.openForGate` must read the demo plan when in demo mode, not the null `auth.user.plan`.

---

## 7. Open questions

- **Demo + cold-email landing**: PRD §14 says cold-email recipients should land in a demo with email pre-populated and create their own account. Today `/start` honors `?email=` but the cold-email flow isn't wired end-to-end. Need a one-click magic link → demo + prefilled email.
- **Demo for plan evaluation**: should a visitor who clicks "Start free trial" on Premium see a sandbox running on the Premium plan (so they evaluate exactly what they'd be paying for)? Currently every demo runs `unlimited`. PRD §10 left "multi-template" demos out of scope for v1; this is the same shape of question.
- **`/start` plan intent**: see §5 audit. Today `/start` always creates a free account; trial intent isn't preserved if the visitor came from a pricing card.

---

## 8. Files this document covers

| File | Role |
|------|------|
| `client/src/pages/LandingPage.vue` | Homepage hero + pricing + end CTA |
| `client/src/pages/PricingPage.vue` | Plan-specific trial CTAs |
| `client/src/pages/FeaturesPage.vue`, `AiPage.vue`, `CompoundsPage.vue` | Mid-funnel marketing |
| `client/src/pages/RegisterPage.vue` | Standard signup, plan-aware |
| `client/src/pages/StartPage.vue` | Demo-converter 3-field signup |
| `client/src/pages/LoginPage.vue` | Login, plan-aware |
| `client/src/pages/WelcomePage.vue` | 8-field onboarding wizard |
| `client/src/components/MarketingLayout.vue` | Marketing top nav + footer |
| `client/src/components/AppLayout.vue` | Authed app top nav |
| `client/src/components/DemoBanner.vue` | In-app demo banner / badge |
| `client/src/router/index.js` | Route guards (auth, demo, onboarding) |
| `client/src/stores/demo.js` | Client-side demo session state |
| `server/src/routes/demo.js` | Demo start/enter/exit/reset/status endpoints |
| `server/src/middleware/requireAuth.js` | `requireAuth`, `requireAuthUser`, `requireRealProfile` |
