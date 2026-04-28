import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { wrapAuth } from '../shared/auth/wrapAuth.js';
import { buildHealthRoutes } from './routes/health.js';
import { buildPromptRoutes } from './routes/prompts.js';
import { buildUsageRoutes } from './routes/usage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIST = path.resolve(__dirname, '../ui-dist');

export function buildRouter(ctx) {
  const router = express.Router();
  const auth = wrapAuth(ctx.config.requireAuth);

  // JSON parser scoped to this router so the host's existing express.json
  // is not duplicated unnecessarily — but having our own keeps us
  // mountable behind hosts that don't parse JSON globally.
  router.use(express.json({ limit: '1mb' }));

  // Canonical-URL redirect: /admin/marketing → /admin/marketing/
  // The browser resolves the HTML's relative asset URLs against the
  // current document path, so without a trailing slash on the root URL
  // it walks one segment up and 404s on assets. The injected <base>
  // tag handles this client-side, but a 301 keeps the URL clean.
  router.use((req, res, next) => {
    const base = ctx.config.basePath;
    if (req.originalUrl === base) {
      return res.redirect(301, `${base}/`);
    }
    next();
  });

  // === API ===
  const api = express.Router();
  api.use(...auth);
  api.use('/health', buildHealthRoutes(ctx));
  api.use('/prompts', buildPromptRoutes(ctx));
  api.use('/usage', buildUsageRoutes(ctx));

  // Shared routes contributed by foundational subsystems (Contacts + Lists)
  // and any modules that mount /api-rooted routers (none in Phase 1).
  for (const [path, subRouter] of Object.entries(ctx.sharedRoutes || {})) {
    if (path.startsWith('/api/')) {
      api.use(path.slice('/api'.length), subRouter);
    }
  }
  router.use('/api', api);

  // === SSE ===
  router.get('/sse/:channel', ...auth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const channel = req.params.channel;
    const unsubscribe = ctx.sse.subscribe(channel, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    req.on('close', () => {
      unsubscribe();
      res.end();
    });
  });

  // === UI ===
  // Static assets (built by `npm run build:ui` into src/ui-dist/)
  if (fs.existsSync(UI_DIST)) {
    router.use(
      '/assets',
      ...auth,
      express.static(path.join(UI_DIST, 'assets'), { index: false, fallthrough: true })
    );
    // SPA fallback — every non-API GET serves the shell. The shell injects
    // window.__MARKETING_BASE__ so the client knows where to call the API.
    router.get(['/', /^\/(?!api\/|sse\/|assets\/).*/], ...auth, (req, res) => {
      sendShell(res, ctx.config.basePath);
    });
  } else {
    // Helpful placeholder when UI hasn't been built yet
    router.get('*', ...auth, (req, res) => {
      res.type('html').send(unbuiltShell(ctx.config.basePath));
    });
  }

  return router;
}

function sendShell(res, basePath) {
  const indexFile = path.join(UI_DIST, 'index.html');
  let html = fs.readFileSync(indexFile, 'utf8');
  // Vite builds with `base: './'` (relative asset URLs) so the bundle is
  // mount-path agnostic. That means asset URLs resolve against the
  // current document URL — including SPA-routed paths like
  // /admin/marketing/settings/prompts, where ./assets/foo.js resolves to
  // /admin/marketing/settings/assets/foo.js (404). Inject a <base> tag
  // pointing at the mount root so all relative URLs anchor correctly.
  //
  // CRITICAL: <base> must come BEFORE any <link>/<script> references in
  // <head>, or the browser resolves their URLs before parsing it. We
  // insert it as the first child of <head>.
  const baseHref = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const inject = `<base href="${baseHref}"><script>window.__MARKETING_BASE__=${JSON.stringify(basePath)};</script>`;
  if (!html.includes('window.__MARKETING_BASE__')) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
  }
  res.type('html').send(html);
}

function unbuiltShell(basePath) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>marketing-admin</title></head>
<body style="font-family:system-ui;padding:24px;max-width:640px;margin:auto">
<h1>marketing-admin</h1>
<p>UI bundle not built yet. Run from the package directory:</p>
<pre style="background:#f4f4f4;padding:12px">cd marketing &amp;&amp; npm install &amp;&amp; npm run build:ui</pre>
<p>Mounted at <code>${basePath}</code>. API health check:
<a href="${basePath}/api/health">${basePath}/api/health</a></p>
</body></html>`;
}
