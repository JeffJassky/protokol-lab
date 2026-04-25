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
import waistRoutes from './routes/waist.js';
import doseRoutes from './routes/doses.js';
import compoundsRoutes from './routes/compounds.js';
import chatRoutes from './routes/chat.js';
import notesRoutes from './routes/notes.js';
import photosRoutes from './routes/photos.js';
import pushRoutes, { publicPushRouter } from './routes/push.js';
import stripeRoutes, { publicStripeRouter } from './routes/stripe.js';
import adminRoutes from './routes/admin.js';
import supportRoutes from './routes/support.js';
import adminSupportRoutes from './routes/adminSupport.js';
import { requireAuth } from './middleware/requireAuth.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import { logger, httpLogger, childLogger, errContext } from './lib/logger.js';

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
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'", 'https://accounts.google.com/gsi/client'],
          'script-src-elem': ["'self'", 'https://accounts.google.com/gsi/client'],
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

  const corsOrigin = isProd
    ? (process.env.APP_URL || false)
    : true;
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // Stripe webhook must see the raw request body to verify the signature.
  // Mounted at an exact path BEFORE express.json() so the global JSON parser
  // doesn't consume the buffer. Other /api/stripe routes parse JSON normally.
  app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }), publicStripeRouter);

  app.use(express.json());
  app.use(cookieParser());

  app.use(httpLogger);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/push', publicPushRouter);
  app.use('/api/push', requireAuth, pushRoutes);

  app.use('/api/settings', requireAuth, settingsRoutes);
  app.use('/api/weight', requireAuth, weightRoutes);
  app.use('/api/food', requireAuth, foodRoutes);
  app.use('/api/foodlog', requireAuth, foodlogRoutes);
  app.use('/api/meals', requireAuth, mealsRoutes);
  app.use('/api/symptoms', requireAuth, symptomsRoutes);
  app.use('/api/waist', requireAuth, waistRoutes);
  app.use('/api/doses', requireAuth, doseRoutes);
  app.use('/api/compounds', requireAuth, compoundsRoutes);
  app.use('/api/chat', requireAuth, chatRoutes);
  app.use('/api/notes', requireAuth, notesRoutes);
  app.use('/api/photos', requireAuth, photosRoutes);
  app.use('/api/stripe', requireAuth, stripeRoutes);
  app.use('/api/support', requireAuth, supportRoutes);
  app.use('/api/admin/support', requireAuth, requireAdmin, adminSupportRoutes);
  app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);

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
