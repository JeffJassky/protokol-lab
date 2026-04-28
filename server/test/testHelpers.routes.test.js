// E2E test-helper routes (server/src/routes/testHelpers.js).
//
// These endpoints are only mounted when NODE_ENV=e2e and gated by an internal
// shared-secret header. We exercise them here in vitest by setting NODE_ENV +
// INTERNAL_TEST_TOKEN before calling createApp() so the router is wired in.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import '../src/models/index.js';
import User from '../src/models/User.js';

const TOKEN = 'vitest-internal-token';
let app;
let savedNodeEnv;
let savedToken;

beforeAll(async () => {
  savedNodeEnv = process.env.NODE_ENV;
  savedToken = process.env.INTERNAL_TEST_TOKEN;
  process.env.NODE_ENV = 'e2e';
  process.env.INTERNAL_TEST_TOKEN = TOKEN;
  // app.js conditionally mounts /api/__test based on NODE_ENV at import time —
  // import after env is set. Relies on Vitest's default per-file worker
  // isolation; a vi.resetModules() reset is unsafe here because mongoose
  // model registration is global and re-importing User.js would throw
  // OverwriteModelError.
  const { createApp } = await import('../src/app.js');
  app = createApp({ serveClient: false });
});

afterAll(() => {
  process.env.NODE_ENV = savedNodeEnv;
  process.env.INTERNAL_TEST_TOKEN = savedToken;
});

beforeEach(async () => {
  // Wipe so the forgot-password rate-limit and reset-token cache don't leak
  // between specs. /reset clears both.
  await request(app).post('/api/__test/reset').set('x-internal-test-token', TOKEN);
});

describe('/api/__test/last-reset-token', () => {
  it('rejects without the internal token header', async () => {
    const res = await request(app).get('/api/__test/last-reset-token?email=x@example.com');
    expect(res.status).toBe(404);
  });

  it('404s when no token has been issued for that email', async () => {
    const res = await request(app)
      .get('/api/__test/last-reset-token?email=nobody@example.com')
      .set('x-internal-test-token', TOKEN);
    expect(res.status).toBe(404);
  });

  it('returns the raw token after /forgot-password records one', async () => {
    const email = 'reset@example.com';
    const passwordHash = await (await import('bcrypt')).hash('initialPassword1', 10);
    await User.create({ email, passwordHash });

    const forgot = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email });
    expect(forgot.status).toBe(200);

    const tokenRes = await request(app)
      .get(`/api/__test/last-reset-token?email=${encodeURIComponent(email)}`)
      .set('x-internal-test-token', TOKEN);
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.token).toMatch(/^[a-f0-9]{64}$/);

    // Token should actually work end-to-end via /reset-password.
    const newPw = 'brandNewPass123';
    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: tokenRes.body.token, password: newPw });
    expect(reset.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: newPw });
    expect(login.status).toBe(200);
  });
});
