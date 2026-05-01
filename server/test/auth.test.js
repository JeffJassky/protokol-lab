// Full coverage of /api/auth routes. Pattern for future route suites:
//   - Build a fresh express app per file via createApp()
//   - Use supertest agent() to preserve cookies across requests
//   - Hit the real routes against in-memory Mongo (see test/setup.js)
//
// We assert both happy paths and edge cases:
//   register: duplicate email, weak password, invalid email
//   login: wrong password, missing user, wrong case
//   /me: no cookie, tampered cookie, deleted user, good cookie
//   forgot: unknown email returns 200 (no enumeration)
//   reset: bad token, expired token, happy path rotates password

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import * as emailService from '../src/services/email.js';

// Stub OAuth2Client.verifyIdToken so we never hit Google during tests.
// Hoisted so the mock factory (which runs before module bodies) can capture
// the same mock fn that tests reach via the imported alias below.
const { googleVerifyMock } = vi.hoisted(() => ({ googleVerifyMock: vi.fn() }));
vi.mock('google-auth-library', () => {
  class OAuth2Client {
    verifyIdToken(...args) { return googleVerifyMock(...args); }
  }
  return { OAuth2Client };
});

const app = createApp({ serveClient: false });

const valid = { email: 'user@example.com', password: 'passw0rd-ok' };

async function registerUser(overrides = {}) {
  const body = { ...valid, ...overrides };
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/register').send(body);
  return { agent, res, body };
}

describe('POST /api/auth/register', () => {
  it('creates user, returns 201, sets cookie, sends welcome email', async () => {
    const { res } = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: valid.email });
    expect(res.body.user.id).toBeDefined();
    const tokenCookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
    expect(tokenCookie).toMatch(/HttpOnly/i);

    // welcomeEmail is fire-and-forget — wait a microtask for the .catch chain.
    await new Promise((r) => setImmediate(r));
    expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith(valid.email);

    const persisted = await User.findOne({ email: valid.email });
    expect(persisted).toBeTruthy();
    expect(persisted.passwordHash).not.toBe(valid.password);
  });

  it('rejects duplicate email (409)', async () => {
    await registerUser();
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('rejects invalid email (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: valid.password });
    expect(res.status).toBe(400);
  });

  it('rejects short password (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.co', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/8 characters/);
  });

  it('normalizes email to lowercase and trims', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: '  MixedCase@Example.COM  ', password: valid.password });
    expect(res.status).toBe(201);
    const persisted = await User.findOne({ email: 'mixedcase@example.com' });
    expect(persisted).toBeTruthy();
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('returns 200 + cookie on correct creds', async () => {
    const res = await request(app).post('/api/auth/login').send(valid);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(valid.email);
    const tokenCookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: valid.email, password: 'wrong-pass' });
    expect(res.status).toBe(401);
    const tokenCookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeUndefined();
  });

  it('returns 401 on unknown email (same error shape = no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@nowhere.io', password: 'anything-goes' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('is case-insensitive for email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: valid.email.toUpperCase(), password: valid.password });
    expect(res.status).toBe(200);
  });

  it('returns 400 when fields missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('401 without cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 with tampered token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'token=not-a-real-jwt');
    expect(res.status).toBe(401);
  });

  it('401 when token valid but user was deleted', async () => {
    const { agent } = await registerUser();
    await User.deleteMany({});
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 when token signed with wrong secret', async () => {
    const { agent } = await registerUser();
    const user = await User.findOne({ email: valid.email });
    const badToken = jwt.sign({ userId: user._id }, 'other-secret', { expiresIn: '7d' });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${badToken}`);
    expect(res.status).toBe(401);
  });

  it('401 when token expired', async () => {
    const { agent } = await registerUser();
    const user = await User.findOne({ email: valid.email });
    const expired = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${expired}`);
    expect(res.status).toBe(401);
  });

  it('returns user shape on success', async () => {
    const { agent } = await registerUser();
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      email: valid.email,
      isAdmin: false,
      hasStripeCustomer: false,
      hasActiveSubscription: false,
    });
    expect(res.body.user.passwordHash).toBeUndefined();
  });
});

describe('PATCH /api/auth/me', () => {
  it('updates displayName', async () => {
    const { agent } = await registerUser();
    const res = await agent.patch('/api/auth/me').send({ displayName: 'Jeff' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBe('Jeff');
  });

  it('rejects 61-char displayName', async () => {
    const { agent } = await registerUser();
    const res = await agent
      .patch('/api/auth/me')
      .send({ displayName: 'x'.repeat(61) });
    expect(res.status).toBe(400);
  });

  it('treats empty string as null', async () => {
    const { agent } = await registerUser();
    const res = await agent.patch('/api/auth/me').send({ displayName: '   ' });
    expect(res.status).toBe(200);
    expect(res.body.user.displayName).toBeNull();
  });

  it('400 when no allowed field provided', async () => {
    const { agent } = await registerUser();
    const res = await agent.patch('/api/auth/me').send({ email: 'new@x.com' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears cookie', async () => {
    const { agent } = await registerUser();
    const res = await agent.post('/api/auth/logout').send({});
    expect(res.status).toBe(200);
    // set-cookie should expire the token
    expect(res.headers['set-cookie']?.[0]).toMatch(/token=;/);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('returns 200 for unknown email (no enumeration) and does not email', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@nowhere.io' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('returns 200 for invalid email format (silently)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'garbage' });
    expect(res.status).toBe(200);
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('stores tokenHash + expiry and sends reset email for known user', async () => {
    await registerUser();
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: valid.email });
    expect(res.status).toBe(200);
    const user = await User.findOne({ email: valid.email });
    expect(user.passwordResetTokenHash).toBeTruthy();
    expect(user.passwordResetExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [to, url] = emailService.sendPasswordResetEmail.mock.calls[0];
    expect(to).toBe(valid.email);
    expect(url).toMatch(/\/reset-password\?token=[a-f0-9]{64}/);
  });

  it('throttles re-request while token is still fresh', async () => {
    await registerUser();
    await request(app).post('/api/auth/forgot-password').send({ email: valid.email });
    emailService.sendPasswordResetEmail.mockClear();

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: valid.email });
    expect(res.status).toBe(200);
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/reset-password', () => {
  async function requestResetToken() {
    await registerUser();
    // Drive through the real forgot-password flow so the token is hashed
    // exactly as the code expects, then pull the raw token off the mock.
    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: valid.email });
    const [, url] = emailService.sendPasswordResetEmail.mock.calls[0];
    return url.match(/token=([a-f0-9]{64})/)[1];
  }

  it('rotates password on valid token, clears token fields', async () => {
    const token = await requestResetToken();
    const newPassword = 'brand-new-pass-123';
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: newPassword });
    expect(res.status).toBe(200);

    const user = await User.findOne({ email: valid.email });
    expect(user.passwordResetTokenHash).toBeNull();
    expect(user.passwordResetExpiresAt).toBeNull();

    // Old password must fail, new must succeed.
    const badLogin = await request(app)
      .post('/api/auth/login')
      .send(valid);
    expect(badLogin.status).toBe(401);

    const goodLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: valid.email, password: newPassword });
    expect(goodLogin.status).toBe(200);
  });

  it('rejects unknown token (400)', async () => {
    await registerUser();
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(64), password: 'whatever-12345' });
    expect(res.status).toBe(400);
  });

  it('rejects expired token (400)', async () => {
    const token = await requestResetToken();
    // Manually expire it in the DB.
    await User.updateOne(
      { email: valid.email },
      { $set: { passwordResetExpiresAt: new Date(Date.now() - 1000) } },
    );
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'brand-new-pass-123' });
    expect(res.status).toBe(400);
  });

  it('rejects weak new password (400)', async () => {
    const token = await requestResetToken();
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('rejects missing token (400)', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ password: 'brand-new-pass-123' });
    expect(res.status).toBe(400);
  });

  it('token hash stored matches sha256 of raw token (no raw-token storage)', async () => {
    const token = await requestResetToken();
    const user = await User.findOne({ email: valid.email });
    const expected = crypto.createHash('sha256').update(token).digest('hex');
    expect(user.passwordResetTokenHash).toBe(expected);
    expect(user.passwordResetTokenHash).not.toBe(token);
  });
});

describe('POST /api/auth/google', () => {
  const ORIGINAL_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
    googleVerifyMock.mockReset();
  });

  function mockGooglePayload(overrides = {}) {
    googleVerifyMock.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-123',
        email: 'google-user@example.com',
        email_verified: true,
        name: 'Google User',
        picture: 'https://example.com/pic.png',
        ...overrides,
      }),
    });
  }

  it('creates new user, sets cookie, returns 201, sends welcome email', async () => {
    mockGooglePayload();
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('google-user@example.com');
    const tokenCookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();

    const persisted = await User.findOne({ email: 'google-user@example.com' });
    expect(persisted.googleId).toBe('google-sub-123');
    expect(persisted.passwordHash).toBeNull();
    expect(persisted.avatarUrl).toBe('https://example.com/pic.png');
    expect(persisted.displayName).toBe('Google User');

    await new Promise((r) => setImmediate(r));
    expect(emailService.sendWelcomeEmail).toHaveBeenCalledWith('google-user@example.com');
  });

  it('returns 200 (not 201) and does not re-send welcome on returning google user', async () => {
    mockGooglePayload();
    await request(app).post('/api/auth/google').send({ credential: 'fake-id-token' });
    emailService.sendWelcomeEmail.mockClear();

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' });
    expect(res.status).toBe(200);
    expect(emailService.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('auto-links google to an existing email/password account when emails match', async () => {
    await registerUser({ email: 'shared@example.com' });
    mockGooglePayload({ email: 'shared@example.com', sub: 'google-sub-link' });

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' });
    expect(res.status).toBe(200);

    const user = await User.findOne({ email: 'shared@example.com' });
    expect(user.googleId).toBe('google-sub-link');
    expect(user.passwordHash).toBeTruthy(); // password account preserved
  });

  it('matches existing user case-insensitively (Google email upper-cased)', async () => {
    await registerUser({ email: 'shared@example.com' });
    mockGooglePayload({ email: 'SHARED@Example.COM' });

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' });
    expect(res.status).toBe(200);

    expect(await User.countDocuments({})).toBe(1);
  });

  it('returns 401 when Google rejects the credential', async () => {
    googleVerifyMock.mockRejectedValue(new Error('Invalid token signature'));
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'tampered' });
    expect(res.status).toBe(401);
    const tokenCookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeUndefined();
  });

  it('rejects payload with email_verified=false (401)', async () => {
    mockGooglePayload({ email_verified: false });
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' });
    expect(res.status).toBe(401);
    expect(await User.countDocuments({})).toBe(0);
  });

  it('returns 400 when credential field missing', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
  });

  it('returns 503 when GOOGLE_CLIENT_ID is not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' });
    expect(res.status).toBe(503);
    process.env.GOOGLE_CLIENT_ID = ORIGINAL_CLIENT_ID;
  });

  it('Google login from an anon demo session destroys the demo (cookie + sandbox)', async () => {
    // Seed a template + start an anon demo on the same agent.
    await User.create({ email: 'tmpl@demo.local', isDemoTemplate: true });
    const agent = request.agent(app);
    const start = await agent.post('/api/demo/start');
    expect(start.status).toBe(201);
    const sandboxId = start.body.sandboxId;
    expect(await User.findById(sandboxId)).not.toBeNull();

    mockGooglePayload({ email: 'returning-google@example.com', sub: 'g-sub-cleanup' });
    // Pre-create the user so this is a "returning google user" login, not signup.
    await User.create({ email: 'returning-google@example.com', googleId: 'g-sub-cleanup' });

    const login = await agent
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' });
    expect(login.status).toBe(200);

    // Sandbox doc gone, demo cookie cleared, no activeProfileId left over.
    expect(await User.findById(sandboxId)).toBeNull();
    const demoCookie = (login.headers['set-cookie'] || [])
      .find((c) => c.startsWith('demo_token='));
    expect(demoCookie, 'login response must clear demo_token cookie').toBeTruthy();
    expect(demoCookie).toMatch(/expires=Thu, 01 Jan 1970|max-age=0\b|max-age=-\d+/i);
  });
});

// Native (Capacitor) clients can't use the cookie reliably across origins.
// They opt into Bearer auth with `X-Auth-Mode: bearer` on the auth call,
// receive the JWT in the JSON body, and pass it back as Authorization on
// subsequent requests. Web continues to use cookies and never sees the JWT
// in JS-readable space.
describe('Bearer auth (native opt-in via X-Auth-Mode header)', () => {
  it('returns the JWT in the JSON body when X-Auth-Mode=bearer on register', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Auth-Mode', 'bearer')
      .send({ email: 'bearer-register@example.com', password: 'passw0rd-ok' });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.').length).toBe(3); // looks like a JWT
  });

  it('returns the JWT in the JSON body when X-Auth-Mode=bearer on login', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'bearer-login@example.com', password: 'passw0rd-ok' });
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Auth-Mode', 'bearer')
      .send({ email: 'bearer-login@example.com', password: 'passw0rd-ok' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('omits the token from the JSON body for cookie-mode requests (web)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'cookie-only@example.com', password: 'passw0rd-ok' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    // Cookie path still works for the web client.
    const tokenCookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
    expect(tokenCookie).toBeDefined();
  });

  it('authenticates /api/auth/me with Authorization: Bearer (no cookie jar)', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .set('X-Auth-Mode', 'bearer')
      .send({ email: 'bearer-me@example.com', password: 'passw0rd-ok' });
    const token = reg.body.token;
    expect(token).toBeDefined();

    // Plain request() — no agent, no cookie jar. Auth must come from the
    // Authorization header alone.
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('bearer-me@example.com');
  });

  it('rejects /api/auth/me with a malformed Bearer token', async () => {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-real-jwt');
    expect(me.status).toBe(401);
  });

  it('cookie auth still works without any Authorization header (web unchanged)', async () => {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'still-cookie@example.com', password: 'passw0rd-ok' });
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('still-cookie@example.com');
  });

  it('returns the JWT in JSON body on /api/auth/google with X-Auth-Mode=bearer', async () => {
    googleVerifyMock.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-bearer-sub',
        email: 'bearer-google@example.com',
        email_verified: true,
        name: 'Bearer Google',
      }),
    });
    const res = await request(app)
      .post('/api/auth/google')
      .set('X-Auth-Mode', 'bearer')
      .send({ credential: 'fake-id-token' });
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
  });
});

describe('DELETE /api/auth/me', () => {
  beforeEach(() => {
    emailService.sendAccountDeletedEmail.mockClear();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).delete('/api/auth/me').send({ password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('rejects when password missing for password account', async () => {
    const { agent } = await registerUser({ email: 'del-nopw@example.com' });
    const res = await agent.delete('/api/auth/me').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('password_required');
    // User row still exists.
    expect(await User.findOne({ email: 'del-nopw@example.com' })).toBeTruthy();
  });

  it('rejects when password wrong', async () => {
    const { agent } = await registerUser({ email: 'del-bad@example.com' });
    const res = await agent.delete('/api/auth/me').send({ password: 'not-the-right-one' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_password');
    expect(await User.findOne({ email: 'del-bad@example.com' })).toBeTruthy();
  });

  it('deletes user, clears cookie, and emails confirmation on happy path', async () => {
    const { agent, body } = await registerUser({ email: 'del-ok@example.com' });
    const res = await agent.delete('/api/auth/me').send({ password: body.password });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // Cookie cleared (Set-Cookie: token=; expires past).
    const setCookie = (res.headers['set-cookie'] || []).find((c) => c.startsWith('token='));
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/expires=Thu, 01 Jan 1970|max-age=0\b/i);

    // User row gone.
    expect(await User.findOne({ email: 'del-ok@example.com' })).toBeNull();

    // Confirmation email fired (allow microtask for fire-and-forget).
    await new Promise((r) => setImmediate(r));
    expect(emailService.sendAccountDeletedEmail).toHaveBeenCalledWith('del-ok@example.com');
  });

  it('cascades user-owned data via the User cascade hook', async () => {
    // Register, then write a row in a cascaded collection through the API
    // (uses the same userId resolution as a real client).
    const { agent } = await registerUser({ email: 'del-cascade@example.com' });
    const user = await User.findOne({ email: 'del-cascade@example.com' });

    // Drop a WeightLog row directly so we don't depend on a separate route here.
    const WeightLog = (await import('../src/models/WeightLog.js')).default;
    await WeightLog.create({ userId: user._id, weightLbs: 180, date: new Date() });
    expect(await WeightLog.countDocuments({ userId: user._id })).toBe(1);

    const res = await agent.delete('/api/auth/me').send({ password: valid.password });
    expect(res.status).toBe(200);

    expect(await User.findById(user._id)).toBeNull();
    expect(await WeightLog.countDocuments({ userId: user._id })).toBe(0);
  });

  it('OAuth-only account requires `confirm:true` instead of password', async () => {
    googleVerifyMock.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-del-sub',
        email: 'del-oauth@example.com',
        email_verified: true,
        name: 'Delete Me',
      }),
    });
    const agent = request.agent(app);
    const reg = await agent.post('/api/auth/google').send({ credential: 'fake-id-token' });
    expect(reg.status).toBe(201);

    // Without confirm flag → 400.
    const r1 = await agent.delete('/api/auth/me').send({});
    expect(r1.status).toBe(400);
    expect(r1.body.error).toBe('confirmation_required');

    // With confirm:true → 200, user gone.
    const r2 = await agent.delete('/api/auth/me').send({ confirm: true });
    expect(r2.status).toBe(200);
    expect(await User.findOne({ email: 'del-oauth@example.com' })).toBeNull();
  });

  it('rejects password challenge for OAuth-only account (passwordHash absent)', async () => {
    googleVerifyMock.mockResolvedValueOnce({
      getPayload: () => ({
        sub: 'google-del-sub-2',
        email: 'del-oauth-pw@example.com',
        email_verified: true,
        name: 'Delete Me 2',
      }),
    });
    const agent = request.agent(app);
    await agent.post('/api/auth/google').send({ credential: 'fake-id-token' });

    // Sending a password on an OAuth account still hits the confirm branch.
    const res = await agent.delete('/api/auth/me').send({ password: 'whatever' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('confirmation_required');
  });

  it('works with Bearer auth (no cookie)', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .set('X-Auth-Mode', 'bearer')
      .send({ email: 'del-bearer@example.com', password: 'passw0rd-ok' });
    const token = reg.body.token;

    const res = await request(app)
      .delete('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'passw0rd-ok' });
    expect(res.status).toBe(200);
    expect(await User.findOne({ email: 'del-bearer@example.com' })).toBeNull();
  });
});
