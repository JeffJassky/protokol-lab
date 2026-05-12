import 'dotenv/config';
// Sentry must initialize before anything else — its integrations patch
// http/express/mongoose at import time. Modules loaded before this line
// are not instrumented.
import './instrument.js';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { runStartupBackup } from './services/backup.js';
import { initPush } from './services/push.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { startMarketingAdmin, stopMarketingAdmin } from './services/marketingAdmin.js';
import { startMailery, stopMailery } from './services/mailery.js';
import { logger, childLogger, errContext } from './lib/logger.js';

const log = childLogger('boot');
const PORT = process.env.PORT || 3001;

// Mongo connection events — track drops/reconnects that would otherwise be
// silent and surface as mystery 500s.
mongoose.connection.on('disconnected', () => {
  childLogger('db').warn('mongoose disconnected');
});
mongoose.connection.on('reconnected', () => {
  childLogger('db').info('mongoose reconnected');
});
mongoose.connection.on('error', (err) => {
  childLogger('db').error(errContext(err), 'mongoose error');
});

// Sentry's Node SDK already registers process-level capture handlers in
// instrument.js. We additionally flush before exiting so the in-flight
// event reaches Sentry — `Sentry.close()` resolves once the queue is
// drained or the timeout fires.
//
// The `crashing` flag prevents a second uncaught exception (which can
// fire while Sentry is still flushing) from racing process.exit — both
// would interleave logs and call exit simultaneously.
let crashing = false;
async function fatalExit(err, kind) {
  if (crashing) {
    logger.fatal(errContext(err), `${kind} — already exiting, ignoring`);
    return;
  }
  crashing = true;
  logger.fatal(errContext(err), `${kind} — exiting`);
  try {
    const Sentry = await import('@sentry/node');
    await Sentry.close(2000);
  } catch { /* best-effort */ }
  process.exit(1);
}
process.on('uncaughtException', (err) => { fatalExit(err, 'uncaughtException'); });
process.on('unhandledRejection', (err) => { fatalExit(err, 'unhandledRejection'); });

let server;
let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'shutdown requested');
  const forceExit = setTimeout(() => {
    log.error('graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 3000).unref();
  try {
    if (server) {
      log.debug('closing http server');
      await new Promise((resolve) => server.close(resolve));
    }
    log.debug('stopping scheduler');
    await stopScheduler();
    log.debug('stopping marketing admin');
    await stopMarketingAdmin();
    log.debug('stopping mailery');
    await stopMailery();
    log.debug('disconnecting mongo');
    await mongoose.disconnect();
    log.info('shutdown complete');
  } catch (err) {
    log.error(errContext(err), 'error during shutdown');
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// In-memory Mongo for E2E runs. Gated behind USE_MEM_MONGO so production
// (and any env that sets MONGODB_URI) keeps the real connection path.
async function startMemMongoIfRequested() {
  if (process.env.USE_MEM_MONGO !== '1') return;
  // Apple Silicon workaround — see test/setup.js for the long version.
  // Mongo 8.x crashes with SIGILL under Rosetta on M1/M2/M3; pin to
  // 6.0.14 when the host CPU is Apple Silicon (regardless of whether
  // Node itself is running native arm64 or x64 under Rosetta). Set the
  // env var BEFORE the dynamic import so mongodb-memory-server reads it.
  const os = await import('node:os');
  const isAppleSilicon =
    os.platform() === 'darwin' &&
    (os.arch() === 'arm64' || /Apple M[1-9]/.test(os.cpus()[0]?.model || ''));
  if (isAppleSilicon) {
    process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '6.0.14';
  }
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri('protokol-e2e');
  log.info({ uri: process.env.MONGODB_URI }, 'using in-memory mongo (E2E mode)');
}

try {
  log.info({ port: PORT, env: process.env.NODE_ENV || 'development', logLevel: logger.level }, 'starting server');
  await startMemMongoIfRequested();
  const connectStart = Date.now();
  await mongoose.connect(process.env.MONGODB_URI);
  log.info({ durationMs: Date.now() - connectStart }, 'mongo connected');

  runStartupBackup();
  initPush();
  await startScheduler();
  await startMarketingAdmin();
  // Mailery boots after mongo is connected. Internally disables itself if
  // REDIS_URL is missing or MAILER_DISABLED=1, so this is safe to call
  // unconditionally in dev / test / prod.
  await startMailery();

  const app = createApp();
  server = app.listen(PORT, () => {
    log.info({ port: PORT, url: `http://localhost:${PORT}` }, 'http listening');
  });
  server.on('error', (err) => {
    log.fatal(errContext(err), 'http server error');
    process.exit(1);
  });
} catch (err) {
  log.fatal(errContext(err), 'startup failed');
  process.exit(1);
}
