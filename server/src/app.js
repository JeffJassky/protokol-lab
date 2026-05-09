import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import weightRoutes from './routes/weight.js';
import foodRoutes from './routes/food.js';
import foodlogRoutes from './routes/foodlog.js';
import mealsRoutes from './routes/meals.js';
import symptomsRoutes from './routes/symptoms.js';
import metricsRoutes from './routes/metrics.js';
import waterRoutes from './routes/water.js';
import doseRoutes from './routes/doses.js';
import compoundsRoutes from './routes/compounds.js';
import exercisesRoutes from './routes/exercises.js';
import exerciselogRoutes from './routes/exerciselog.js';
import dayStatusRoutes from './routes/dayStatus.js';
import fastingRoutes from './routes/fasting.js';
import chatRoutes from './routes/chat.js';
import notesRoutes from './routes/notes.js';
import photosRoutes from './routes/photos.js';
import photoTypesRoutes from './routes/photoTypes.js';
import pushRoutes, { publicPushRouter } from './routes/push.js';
import stripeRoutes, { publicStripeRouter } from './routes/stripe.js';
import adminRoutes from './routes/admin.js';
import supportRoutes from './routes/support.js';
import adminSupportRoutes from './routes/adminSupport.js';
import demoRoutes from './routes/demo.js';
import trackRoutes from './routes/track.js';
import analysisRoutes from './routes/analysis.js';
import testHelperRoutes from './routes/testHelpers.js';
import * as Sentry from '@sentry/node';
import { requireAuth, requireAuthUser, requireRealProfile } from './middleware/requireAuth.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import { ensureAnonId } from './middleware/anonId.js';
import { logger, httpLogger, childLogger, errContext } from './lib/logger.js';
import { getMarketingAdmin } from './services/marketingAdmin.js';
import { getAgenda } from './services/scheduler.js';
import { createExpressMiddleware as createAgendashMiddleware } from 'agendash';

// Build the Express app without starting the HTTP listener, connecting to
// Mongo, or booting the scheduler. Tests import this to run routes against
// supertest + an in-memory Mongo without side effects. Production entrypoint
// (`index.js`) orchestrates startup around this.
export function createApp({ serveClient = true } = {}) {
  const log = childLogger('boot');
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

  // CSP: allow Google Identity Services (GIS) for Sign in with Google.
  // Theme bootstrap lives in /theme-init.js (external) so no inline-script hash
  // is needed — keep it that way to avoid hash-maintenance churn.
  app.use(
    helmet({
      // Helmet's default 'no-referrer' strips the Referer header on cross-origin
      // requests, so Google's GIS iframe (accounts.google.com/gsi/button) can't
      // see which site embedded it — Google then rejects with "origin not allowed
      // for the given client ID" even when the origin IS in the OAuth client's
      // authorized list. 'strict-origin-when-cross-origin' is the modern browser
      // default: sends only the origin (not full URL) cross-origin over HTTPS.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // Helmet's default 'same-origin' for COOP severs window.opener between
      // our page and any cross-origin popup. Google's GIS popup at
      // accounts.google.com posts the credential back via window.opener.postMessage;
      // under 'same-origin' the popup hangs on /gsi/transform and never closes.
      // 'same-origin-allow-popups' keeps tab-level isolation for non-popup
      // contexts but lets popups we open keep their opener reference.
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // 'unsafe-inline' is required because Google's GIS library injects a
          // bootstrap inline script (tagged //# sourceURL=prepare.js). Their
          // recommended hash drifts whenever Google updates the library, so
          // pinning it would break sign-in on every Google deploy. Tradeoff:
          // weakens CSP's inline-script XSS guard. Acceptable here — Vue's
          // template binding doesn't introduce HTML-injection vectors and we
          // don't render user-supplied HTML.
          'script-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/client'],
          'script-src-elem': ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/client'],
          'frame-src': ["'self'", 'https://accounts.google.com/gsi/'],
          'connect-src': ["'self'", 'https://accounts.google.com/gsi/'],
          'style-src': [
            "'self'",
            "'unsafe-inline'",
            'https://accounts.google.com/gsi/style',
            'https://fonts.googleapis.com',
          ],
          'style-src-elem': [
            "'self'",
            "'unsafe-inline'",
            'https://accounts.google.com/gsi/style',
            'https://fonts.googleapis.com',
          ],
          'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', 'https://*.googleusercontent.com'],
        },
      },
    })
  );

  // Web stays cookie-authenticated against APP_URL. Native (Capacitor) shells
  // run from capacitor://localhost (iOS) or https://localhost (Android) and
  // authenticate via Bearer — they need their origins on the allowlist so
  // browser CORS doesn't block the cross-origin XHR. credentials:true keeps
  // working for the web cookie path; native ignores cookies anyway.
  const NATIVE_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];
  const corsOrigin = isProd
    ? [process.env.APP_URL, ...NATIVE_ORIGINS].filter(Boolean)
    : true;
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Stripe webhook must see the raw request body to verify the signature.
  // Mounted at an exact path BEFORE express.json() so the global JSON parser
  // doesn't consume the buffer. Other /api/stripe routes parse JSON normally.
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), publicStripeRouter);

  app.use(express.json());
  app.use(cookieParser());
  // Funnel tracking. Sets a long-lived bo_aid cookie on first request so
  // server-emitted events (demo_start, demo_signup_convert) and client
  // beacons (page_view, cta_click) share an anonymous identity that can
  // be stitched onto the real userId at register time. Skipped on CORS
  // preflights (the cookie can't be honored on a credentials:'omit' OPTIONS)
  // and on the Stripe webhook (server-to-server, never carries cookies).
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    if (req.path.startsWith('/api/stripe/webhook')) return next();
    return ensureAnonId(req, res, next);
  });

  app.use(httpLogger);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  // Demo routes have a mix of public (anon start, status) and authed
  // endpoints; auth is applied per-route inside the file.
  app.use('/api/demo', demoRoutes);
  // Public funnel beacon. Reads the anon cookie + JWT (if present) but
  // does not require auth — visitors on marketing pages emit page_view.
  // Tight body cap: a real beacon is well under 2KB. The global
  // express.json() default of 100KB combined with the 60-rpm rate limit
  // would let a single IP write ~6MB/min into Mongo as garbage props.
  app.use('/api/track', express.json({ limit: '8kb' }), trackRoutes);

  // Test-only helpers (seed template, reset DB) — mounted ONLY in e2e env.
  // The handlers double-check NODE_ENV at runtime as defense in depth.
  if (process.env.NODE_ENV === 'e2e') {
    app.use('/api/__test', testHelperRoutes);
  }
  app.use('/api/push', publicPushRouter);
  // Push subs are tied to the real account (real user gets reminders even
  // while toggled into demo) — block anonymous demo sessions outright.
  app.use('/api/push', requireAuth, requireAuthUser, pushRoutes);

  // Data routes: use requireAuth alone so demo (anon or authed-with-toggle)
  // can read+write against the active profile (req.userId = sandbox id).
  app.use('/api/settings', requireAuth, settingsRoutes);
  app.use('/api/weight', requireAuth, weightRoutes);
  app.use('/api/food', requireAuth, foodRoutes);
  app.use('/api/foodlog', requireAuth, foodlogRoutes);
  app.use('/api/meals', requireAuth, mealsRoutes);
  app.use('/api/symptoms', requireAuth, symptomsRoutes);
  app.use('/api/metrics', requireAuth, metricsRoutes);
  app.use('/api/water', requireAuth, waterRoutes);
  app.use('/api/doses', requireAuth, doseRoutes);
  app.use('/api/compounds', requireAuth, compoundsRoutes);
  app.use('/api/exercises', requireAuth, exercisesRoutes);
  app.use('/api/exerciselog', requireAuth, exerciselogRoutes);
  app.use('/api/day-status', requireAuth, dayStatusRoutes);
  app.use('/api/fasting', requireAuth, fastingRoutes);
  // Chat is disabled in demo entirely — anon sessions have no quota account
  // and authed-demo users would chat against sandbox-scoped threads.
  app.use('/api/chat', requireAuth, requireRealProfile, chatRoutes);
  app.use('/api/notes', requireAuth, notesRoutes);
  app.use('/api/photos', requireAuth, photosRoutes);
  app.use('/api/photo-types', requireAuth, photoTypesRoutes);
  // Analysis engine — read-only correlations / change-points / projections
  // over the user's existing data. Demo sandboxes can use it; real-only
  // gating happens implicitly because demo data exists in the same shape.
  app.use('/api/analysis', requireAuth, analysisRoutes);
  // Billing is the real account's, even when the user is toggled into demo.
  app.use('/api/stripe', requireAuth, requireAuthUser, stripeRoutes);
  // Support tickets are tied to the real account.
  app.use('/api/support', requireAuth, requireAuthUser, supportRoutes);
  app.use('/api/admin/support', requireAuth, requireAuthUser, requireAdmin, adminSupportRoutes);
  app.use('/api/admin', requireAuth, requireAuthUser, requireAdmin, adminRoutes);

  // Marketing admin suite — mounted at /admin/marketing. Owns its own
  // Mongo connection, Express subtree, and Vue SPA. Auth chain matches
  // the rest of the admin surface (cookie/JWT → user → admin).
  const marketing = getMarketingAdmin();
  if (marketing) {
    app.use('/admin/marketing', marketing.router);
  }

  // Agendash dashboard for the Agenda scheduler — admin-gated, iframed by
  // the Vue admin shell. Agenda boots after createApp() runs, so we lazy-
  // resolve the instance per-request and cache the resulting router on
  // first hit. Returns 503 if a request lands before the scheduler is up
  // (only really possible during startup or if the scheduler failed to
  // initialize — Mongo not connected, etc).
  let agendashRouter = null;
  app.use(
    '/admin/agendash',
    requireAuth,
    requireAuthUser,
    requireAdmin,
    (req, res, next) => {
      if (!agendashRouter) {
        const agenda = getAgenda();
        if (!agenda) return res.status(503).send('Scheduler not running');
        agendashRouter = createAgendashMiddleware({ agenda });
      }
      return agendashRouter(req, res, next);
    },
  );

  if (serveClient) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDist = path.resolve(__dirname, '../../client/dist');
    const clientPrerendered = path.resolve(__dirname, '../../client/prerendered');

    app.use(express.static(clientDist));

    const SHELL_FILE = path.join(clientDist, 'index.html');

    // Prerendered HTML is committed to git with whatever Vite hashes existed at
    // the time of `npm run build:full` locally. Production rebuilds dist/ with
    // fresh content hashes (Puppeteer can't run on the DO build image, so the
    // prerender step is skipped there). If we serve the committed HTML as-is,
    // it 404s on stale /assets/index-OLDHASH.{js,css} and the page renders
    // unstyled. So at server start we read the live shell to learn the *current*
    // asset filenames, and rewrite any matching paths in prerendered HTML on
    // the way out.
    let CURRENT_JS = null;
    let CURRENT_CSS = null;
    try {
      const shellHtml = fs.readFileSync(SHELL_FILE, 'utf8');
      CURRENT_JS = shellHtml.match(/<script[^>]+src="(\/assets\/index-[^"]+\.js)"/)?.[1] || null;
      CURRENT_CSS = shellHtml.match(/<link[^>]+href="(\/assets\/index-[^"]+\.css)"/)?.[1] || null;
      log.info({ js: CURRENT_JS, css: CURRENT_CSS }, 'resolved current dist asset paths for prerender rewrite');
    } catch (err) {
      log.warn({ err: err.message }, 'could not read SHELL_FILE for prerender asset rewrite — prerendered routes may render unstyled');
    }

    function sendPrerendered(res, filepath) {
      if (!CURRENT_JS && !CURRENT_CSS) return res.sendFile(filepath);
      let html;
      try {
        html = fs.readFileSync(filepath, 'utf8');
      } catch {
        return res.sendFile(filepath);
      }
      if (CURRENT_JS) html = html.replace(/\/assets\/index-[A-Za-z0-9_-]+\.js/g, CURRENT_JS);
      if (CURRENT_CSS) html = html.replace(/\/assets\/index-[A-Za-z0-9_-]+\.css/g, CURRENT_CSS);
      res.type('html').send(html);
    }

    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      if (req.path.startsWith('/api/')) return next();

      // Old static blog URLs → 301 to the canonical Vue route. Dropping
      // `.html` keeps inbound links and search-engine equity intact.
      const blogHtml = req.path.match(/^\/blog\/([a-z0-9-]+)\.html$/i);
      if (blogHtml) return res.redirect(301, `/blog/${blogHtml[1]}`);

      if (req.path === '/') {
        const homePrerendered = path.join(clientPrerendered, 'index.html');
        if (fs.existsSync(homePrerendered)) return sendPrerendered(res, homePrerendered);
        return res.sendFile(SHELL_FILE);
      }

      if (req.path.indexOf('.') === -1) {
        const prerendered = path.join(clientPrerendered, req.path, 'index.html');
        if (fs.existsSync(prerendered)) return sendPrerendered(res, prerendered);
      }

      res.sendFile(SHELL_FILE);
    });
  }

  // Sentry's Express error handler must run *before* our final handler
  // so it can capture the error before we respond. It only forwards 5xx
  // (and unhandled exceptions) — 4xx noise stays out of Sentry. No-op
  // when SENTRY_DSN is unset.
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  app.use((err, req, res, _next) => {
    const reqLog = req.log || logger;
    reqLog.error(
      { ...errContext(err), method: req.method, path: req.path, userId: req.userId ? String(req.userId) : undefined },
      'unhandled route error',
    );
    if (res.headersSent) return;
    res.status(err.status || 500).json({ error: 'Internal server error' });
  });

  return app;
}
