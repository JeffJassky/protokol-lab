# Deploy Build Pipeline

What gets built, where each artifact comes from, and which ones need to be regenerated locally before pushing.

> **TL;DR:** The DigitalOcean buildpack runs `heroku-postbuild` and produces the server, the SPA bundle, the marketing UI, and the help site. It cannot run headless Chromium, so a small set of artifacts — prerendered marketing HTML, OG images — must be generated locally and committed. One artifact (`client/public/llms.txt`) is still hand-written.

See also: [prerendering.md](./prerendering.md) for the why behind static marketing HTML, [testing.md](./testing.md#ci--cd-pipeline) for the full CI/CD flow.

---

## The three sites in this monorepo

| Site | Package | Output | Served from |
|---|---|---|---|
| **Client** — Vue SPA + static marketing HTML + blog | `client/` | `client/dist/`, `client/prerendered/`, `client/public/` | Express in `server/` — see `server/src/index.js` fall-through |
| **Help docs** — VitePress static site | `help/` | `help/.vitepress/dist/` | Same Express, mounted at `help.protokollab.com` alias |
| **Marketing UI components** — Vite library | `marketing/` | `marketing/dist/` | Imported by `client/` at build time |

Server (`server/`) is plain Node — no build artifact, just `npm install` + `npm start`.

---

## What runs on DigitalOcean (the buildpack)

DO's Node buildpack runs the root `package.json` `heroku-postbuild` script:

```
ensure-core
  → install + build marketing (vite build)
  → install server
  → install + build client      (sitemap + vite build)
  → install + build help        (vitepress build + generate-llms.mjs)
```

The buildpack does **not** run:

- `client/scripts/prerender.mjs` — needs headless Chromium
- `client/scripts/generate-og.mjs` — needs headless Chromium
- `client/scripts/generate-icons.js` — one-off, app icons rarely change

These run locally via `npm run build:full --prefix client` and their outputs are committed to git.

`PUPPETEER_SKIP_DOWNLOAD=true` is set in `.do/app.yaml` so `npm install --prefix client` skips the ~150 MB Chromium download in the buildpack.

---

## Artifact inventory

| Artifact | Generator | Where it runs | Committed? |
|---|---|---|---|
| `client/dist/**` (SPA bundle) | `vite build` | DO buildpack ✓ | No |
| `client/public/sitemap.xml` | `client/scripts/generate-sitemap.mjs` (driven by `marketing-meta.js`) | DO buildpack ✓ (chained in `client` `build`) | Yes — also regenerated each build |
| `client/public/llms.txt` | **none — hand-written** | — | Yes |
| `client/public/robots.txt` | **none — hand-written** | — | Yes |
| `client/public/og/*.png` | `client/scripts/generate-og.mjs` (puppeteer) | Local only | Yes |
| `client/prerendered/<route>/index.html` | `client/scripts/prerender.mjs` (puppeteer) | Local only | Yes |
| `marketing/dist/**` | `vite build` | DO buildpack ✓ | No |
| `help/.vitepress/dist/**` (HTML pages) | `vitepress build` | DO buildpack ✓ | No |
| `help/.vitepress/dist/sitemap.xml` | VitePress `sitemap` config in `help/.vitepress/config.js` | DO buildpack ✓ | No |
| `help/.vitepress/dist/llms.txt` + `llms-full.txt` | `help/scripts/generate-llms.mjs` | DO buildpack ✓ (chained in help `build`) | No |
| Server JS | (no build step) | — | — |

---

## Local rebake workflow

Before pushing changes that touch any of:

- a Vue component under `client/src/pages/marketing/`
- a blog post or comparison page
- `client/src/marketing-meta.js` (titles, descriptions, JSON-LD, routes)
- `client/index.html` (analytics, fonts, theme init)
- OG metadata for any marketing route
- `client/public/llms.txt` (manually)

Run:

```bash
cd client
npm run build:full
```

That chains `sitemap → og → vite build → prerender`. Then:

```bash
git add client/prerendered client/public/sitemap.xml client/public/og
git commit -m "rebake marketing artifacts"
```

If you only changed an OG image: `npm run og` is enough. If you only changed routes/meta: `npm run sitemap && npm run prerender` is enough. The full chain is just the safe default.

---

## Help site — fully CI-driven

Help is the simple case. Everything regenerates from the markdown sources on every deploy:

```bash
cd help
npm run build   # vitepress build . && node scripts/generate-llms.mjs
```

No artifacts under `help/` need to be committed (except the markdown sources themselves under `help/getting-started/`, `help/tracking/`, etc.).

If you add or rename a page, the next deploy regenerates the sitemap, llms.txt, and llms-full.txt without any local action.

---

## Marketing UI — fully CI-driven

`marketing/` is a Vite library that `client/` imports. The buildpack runs `npm run build:ui --prefix marketing` before `client/` installs, so `client/`'s bundle gets the latest marketing components.

There is no public surface on `marketing/` itself — no sitemap, no llms.txt, no prerender.

---

## The hand-written `client/public/llms.txt`

This file is the AI-crawler index for the marketing site (`https://protokollab.com/llms.txt`). It is **not** auto-generated because it mixes:

- A static product description (the long opening paragraph)
- Feature list (somewhat overlapping with `marketing-meta.js`)
- FAQ-style content not present in any other data source
- Links to blog posts and comparison pages (which **are** in `marketing-meta.js`)

A future generator could template the static prose + hardcoded FAQs and then walk `marketing-meta.js` for the route list. Not done yet. Until then: edit by hand, keep it under ~10 KB, mirror updates from the help site's `llms.txt` when adding a new feature.

---

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| Prod marketing page shows old copy | Forgot to rebake `client/prerendered/` | `cd client && npm run build:full && git add client/prerendered && commit` |
| OG card on Twitter/Slack shows old image | Forgot `npm run og` | `cd client && npm run og && commit` |
| Help docs llms.txt missing a new page | None — should always update on deploy | If it didn't, check `help/scripts/generate-llms.mjs` ran |
| DO deploy fails on `npm install --prefix client` with puppeteer error | `PUPPETEER_SKIP_DOWNLOAD` got unset | Reset in `.do/app.yaml` and redeploy |
| `client/public/sitemap.xml` differs from committed version after pull | Expected — it's regenerated each build. Either commit the new one or ignore the diff. | — |

---

## Future work

- **Auto-rebake via GitHub Actions.** A workflow that runs on push to main, regenerates `prerendered/` + `og/`, commits the diff back. Removes the "forgot to rebake" footgun. Cost: extra CI minutes, plus the commit-back churn.
- **Generator for `client/public/llms.txt`.** See section above — would require hardcoding the FAQ/product copy in the generator script.
- **Move help to its own deployment.** Currently the help site is built and served by the same DO app. Splitting it onto Cloudflare Pages would let it deploy independently and make this matrix simpler.
