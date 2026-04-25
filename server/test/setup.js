// Global test harness. Runs once per Vitest worker.
//
// Responsibilities:
//   1. Set env vars the app requires at import time (JWT_SECRET, NODE_ENV).
//   2. Boot an in-memory MongoDB and connect mongoose before any test loads.
//   3. Mock side-effectful modules (SendGrid email, push) so tests don't
//      hit the network or require real credentials.
//   4. Clean all collections between tests to keep them isolated.
//   5. Tear everything down after the suite.

import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

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
    customers: { create: vi.fn(), update: vi.fn() },
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
