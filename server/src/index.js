import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { runStartupBackup } from './services/backup.js';
import { initPush } from './services/push.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';
import { startMarketingAdmin, stopMarketingAdmin } from './services/marketingAdmin.js';
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

process.on('uncaughtException', (err) => {
  logger.fatal(errContext(err), 'uncaughtException — exiting');
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  logger.fatal(errContext(err), 'unhandledRejection — exiting');
  process.exit(1);
});

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
