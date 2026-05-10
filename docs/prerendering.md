# Marketing Prerendering

How marketing pages and blog posts get baked into static HTML, why we bother, and where to look when something breaks.

> **TL;DR:** the app is a Vue SPA, but search and AI crawlers can't render SPAs reliably. At build time we drive a headless Chromium through every marketing route, snapshot the rendered DOM, and write it to a flat `.html` file. The server serves those files to crawlers and on first paint, then the SPA hydrates over the top.

---

## Why we do it

Three reasons, in order of importance:

1. **SEO.** Googlebot does run JavaScript, but it's slow and unreliable, especially for sites that aren't huge. AI crawlers (ClaudeBot, GPTBot, PerplexityBot) often don't run JS at all. If our pages are blank without JS, we don't show up in search or get cited by AI answers. Prerendered HTML fixes this completely.
2. **First paint speed.** A flat HTML file with all the text and images already in it appears instantly. The SPA shell would show a blank screen while it boots, fetches data, and renders. For a marketing page, that blank screen is where the user bounces.
3. **Resilience.** If our API is slow or down, the prerendered marketing page still shows up. The SPA can degrade behind it.

The cost is build complexity and stale content (until the next build), which is fine for marketing copy that changes weekly, not by the second.

---

## What gets prerendered

| Surface | Source | Output | Who sees it |
|---------|--------|--------|-------------|
| SPA shell | `client/index.html` | `client/dist/index.html` | Logged-in app users, fallback for unknown routes |
| Marketing routes | Vue components under `client/src/pages/marketing/*` driven by `client/src/marketing-meta.js` | `client/prerendered/<route>/index.html` | Crawlers + first paint for `/`, `/pricing`, `/features`, `/about`, `/faq`, `/compounds`, `/ai`, `/medical-advisory`, `/privacy`, `/terms` |
| Blog posts | Same SPA components, route-driven | `client/prerendered/blog/<slug>/index.html` | Crawlers + first paint for every `/blog/*` URL |
| Comparison pages | Same | `client/prerendered/compare/<competitor>/index.html` | Crawlers + first paint for `/compare/*` |

The SPA is still the same SPA. There's no separate static site generator. Prerendering just freezes a snapshot of what the SPA *would* render for each route into a flat file.

---

## How the build works

Five steps. Read top to bottom.

### 1. `vite build`

Standard Vite build. Spits out `client/dist/` with the JS bundle, CSS, and `index.html` (the SPA shell). At this point the marketing pages exist only as Vue components — no HTML yet.

### 2. `client/scripts/prerender.mjs` boots a tiny static server

It serves `client/dist/` on a random localhost port. `/api/auth/me` is stubbed to return `401` so the SPA renders the guest (logged-out) view instead of trying to load a real user. Other `/api/*` calls return `404`.

### 3. Puppeteer drives a headless Chromium

The script reads the list of routes from `client/src/marketing-meta.js` (the `spaRoutes()` export) and visits each one in a real browser:

```
http://localhost:<port>/
http://localhost:<port>/pricing
http://localhost:<port>/features
http://localhost:<port>/blog/adhd-nutrition-tracker
...
```

For each URL it waits for `networkidle0` (no in-flight requests for 500ms) plus an extra 250ms so [`@unhead/vue`](https://unhead.unjs.io/) finishes flushing per-page `<title>`, `<meta>`, and JSON-LD into the document.

### 4. Snapshot the rendered DOM

```js
const html = await page.evaluate(
  () => '<!doctype html>\n' + document.documentElement.outerHTML
);
```

That's literally it. We grab the entire `<html>` after the browser is done rendering, and that becomes the file we ship. The string already contains the hydrated `<div id="app">`, the per-route head tags, the JSON-LD, and a `<script type="module">` reference back to the SPA bundle.

### 5. Write to `client/prerendered/<route>/index.html`

The output goes **outside** of `dist/` on purpose. It gets committed to git. Why?

- DigitalOcean (our prod box) doesn't have the system libs Chromium needs, so it can't run Puppeteer at deploy time.
- Solution: run Puppeteer locally, commit the baked HTMLs to the repo, and the server reads them at runtime as plain files. The build on the server doesn't try to prerender at all.

This is also why a giant `git status` on this repo shows files under `client/prerendered/` — they're build artifacts that intentionally live in source control.

---

## How requests get served at runtime

Express on the production server has a fall-through chain. For an inbound `GET /blog/glp1-nausea-timeline`:

1. **API routes?** No, not `/api/*`. Skip.
2. **Static asset?** No, not under `/assets/`. Skip.
3. **Prerendered file?** Yes — `client/prerendered/blog/glp1-nausea-timeline/index.html` exists. Serve it. **Done.**
4. **Otherwise**, fall through to `client/dist/index.html` (the SPA shell) so the SPA can client-side-route to wherever the user is going.

So the same URL serves two things depending on who asks: a prerendered crawler-friendly HTML for marketing routes, the SPA shell for everything else. The user never notices because once the prerendered HTML loads in a real browser, the bundled `<script type="module">` boots the SPA, hydrates over the static markup, and from that point on everything is interactive.

---

## When you need to rebake the prerendered files

Anything that changes the visible output of a marketing page:

- Edited a Vue component under `src/pages/` or `src/components/marketing/`
- Added or removed a blog post / comparison page
- Changed `marketing-meta.js` (titles, descriptions, JSON-LD)
- Changed the global SPA shell (`client/index.html`) — e.g. analytics tags, fonts, theme init
- Added a new route to the marketing surface

Run:

```bash
cd client
npm run build         # produces dist/
npm run prerender     # writes prerendered/
```

Commit the changes under `client/prerendered/`. Otherwise prod will keep serving yesterday's HTML to crawlers.

If you only need to patch every prerendered file with a single string change (like adding a `<script>` tag site-wide), it's faster to write a one-shot Node script that walks `client/prerendered/**/*.html` and rewrites in place — see `client/scripts/inject-ga.mjs` for an example. Still rebake on the next full build.

---

## How to verify it worked

For any marketing URL, the served HTML should contain the actual page text — not just an empty `<div id="app">`.

```bash
# Should print the full hero copy, not <div id="app"></div>
curl -s https://protokollab.com/pricing | grep -o "Free to start"

# Or inspect the head:
curl -s https://protokollab.com/blog/glp1-nausea-timeline | grep '<title>'
```

In Chrome DevTools, "View Page Source" (Cmd-Option-U, not "Inspect") shows what the crawler sees. If the source is mostly an empty shell, prerendering didn't run for that route.

To confirm in Search Console: Google's URL Inspection → "Test live URL" → screenshot should look like the real page, not a blank background.

---

## Things that go wrong

- **New route doesn't appear.** Check `client/src/marketing-meta.js` — `spaRoutes()` is the source of truth for the prerender list. If it's not there, Puppeteer never visits it.
- **Blank prerendered file.** Usually means `@unhead/vue` hadn't flushed yet. Bump the post-`networkidle0` wait in `prerender.mjs`, or check that the page actually rendered something with auth stubbed to 401.
- **Stale content in prod.** Forgot to commit `client/prerendered/` after a marketing edit. The SPA looks correct on dev because it renders dynamically; crawlers and first paint still show the old HTML.
- **Puppeteer fails locally.** Usually a Chromium download issue. `cd client && npm rebuild puppeteer` or delete `client/node_modules/puppeteer` and reinstall.
- **CI tries to prerender.** It shouldn't. The prerender step runs locally only, and the artifacts are committed. If a deploy is failing on Puppeteer, something invoked `npm run prerender` in the deploy pipeline.

---

## Related docs

- [Deploy Build Pipeline](./deploy-build.md) — full matrix of build artifacts across client/help/marketing, what regenerates in CI vs locally.
- [Funnel Analytics](./funnel-analytics.md) — how marketing visitors get tracked through the funnel after they land.
- [Observability](./observability.md) — Sentry + Pino, how to tell if prod is actually broken vs. just slow.
- [Testing](./testing.md) — Playwright `@synthetic` subset hits real prod URLs, including prerendered ones.
