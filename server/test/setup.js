// Global test harness. Runs once per Vitest worker.
//
// Responsibilities:
//   1. Set env vars the app requires at import time (JWT_SECRET, NODE_ENV).
//   2. Boot an in-memory MongoDB and connect mongoose before any test loads.
//   3. Mock side-effectful modules (SendGrid email, push) so tests don't
//      hit the network or require real credentials.
//   4. Clean all collections between tests to keep them isolated.
//   5. Tear everything down after the suite.

import os from 'node:os';
import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';

// Apple Silicon workaround. mongodb-memory-server's default Mongo binary
// (8.x) crashes with SIGILL on M1/M2/M3, masquerading as the misleading
// "AVX required" error — Mongo 8.x ships x64 instructions that don't
// translate cleanly under Rosetta. Pin to 6.0.14 (LTS branch that runs
// reliably on Apple Silicon under Rosetta and natively).
//
// Detection: `os.arch()` reflects the Node binary, not the host CPU —
// people running an x64 Node under Rosetta on an M1 still need this fix.
// We check for "Apple M*" in the CPU model when on darwin.
//
// CI (linux x64) skips this branch and uses the package default.
//
// IMPORTANT: env vars must be set BEFORE mongodb-memory-server is loaded.
// ESM static imports hoist above expression statements, so the package is
// imported below via top-level `await import` — any earlier static import
// would already have read the unset env and chosen the default binary.
function isAppleSilicon() {
  if (os.platform() !== 'darwin') return false;
  if (os.arch() === 'arm64') return true;
  try {
    return /Apple M[1-9]/.test(os.cpus()[0]?.model || '');
  } catch {
    return false;
  }
}
if (isAppleSilicon()) {
  process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '6.0.14';
}
const { MongoMemoryServer } = await import('mongodb-memory-server');
// Register every Mongoose model up front. The User cascade hook resolves
// models by string name; tests that don't import the route surface still
// need every model registered for the cascade to find them.
import '../src/models/index.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3001';
process.env.COOKIE_SAMESITE = 'lax';
// Disable Sendgrid real sends; email.js no-ops when key is absent.
delete process.env.SENDGRID_API_KEY;
delete process.env.SENDGRID_FROM_EMAIL;

// Silence pino fully in tests unless a dev exports LOG_LEVEL=debug.
// (LOG_LEVEL=silent is recognized by pino.)

// ---- Global mocks ----
// Email service: record calls, never network.
vi.mock('../src/services/email.js', () => ({
  sendPasswordResetEmail: vi.fn(async () => {}),
  sendWelcomeEmail: vi.fn(async () => {}),
  sendAccountDeletedEmail: vi.fn(async () => {}),
  sendTicketCreatedUserEmail: vi.fn(async () => {}),
  sendTicketAdminNotifyEmail: vi.fn(async () => {}),
  sendTicketStatusChangedEmail: vi.fn(async () => {}),
  sendTicketReplyEmail: vi.fn(async () => {}),
}));

// Push service: never try to call web-push.
vi.mock('../src/services/push.js', () => ({
  initPush: vi.fn(),
  isPushConfigured: vi.fn(() => false),
  getVapidPublicKey: vi.fn(() => null),
  sendToUser: vi.fn(async () => ({ sent: 0, failed: 0 })),
  sendToSubscription: vi.fn(async () => ({ ok: true })),
}));

// Stripe client: don't talk to Stripe. Individual tests can override per-call.
vi.mock('../src/services/stripe.js', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn() } },
    customers: { create: vi.fn(), update: vi.fn(), del: vi.fn(async () => ({ deleted: true })) },
    subscriptions: { retrieve: vi.fn(), cancel: vi.fn(), update: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
    billingPortal: { sessions: { create: vi.fn() } },
  },
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_MODE: 'test',
  isStripeConfigured: vi.fn(() => true),
}));

let memServer;

beforeAll(async () => {
  memServer = await MongoMemoryServer.create();
  const uri = memServer.getUri();
  await mongoose.connect(uri, { dbName: 'test' });
});

afterEach(async () => {
  // Drop all collections between tests so state doesn't leak.
  const collections = mongoose.connection.collections;
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }
  vi.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memServer) await memServer.stop();
});
