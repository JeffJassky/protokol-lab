// Demo mode — session split. Verifies requireAuth resolves req.userId
// (data scope) and req.authUserId (auth identity) correctly across all
// three modes:
//
//   1. Authed user, no demo toggle: userId === authUserId === real user
//   2. Authed user, demo toggle on: userId = sandbox, authUserId = real user
//   3. Anonymous demo (no JWT, valid demo cookie): userId = sandbox, authUserId = null
//
// Also verifies requireAuthUser rejects mode #3 to protect billing/push/
// account routes from anonymous demo traffic.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { requireAuth, requireAuthUser } from '../src/middleware/requireAuth.js';
import { signDemoToken, DEMO_COOKIE_NAME } from '../src/lib/demoSession.js';
import User from '../src/models/User.js';

function mkApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/whoami', requireAuth, (req, res) => {
    res.json({
      userId: req.userId ? String(req.userId) : null,
      authUserId: req.authUserId ? String(req.authUserId) : null,
    });
  });
  app.get('/auth-only', requireAuth, requireAuthUser, (req, res) => {
    res.json({ ok: true });
  });
  return app;
}

function jwtFor(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

describe('Demo session split', () => {
  beforeAll(async () => {
    await User.syncIndexes();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  it('authed user (no demo toggle): userId === authUserId', async () => {
    const u = await User.create({ email: 'a@example.com' });
    const res = await request(mkApp())
      .get('/whoami')
      .set('Cookie', `token=${jwtFor(u._id)}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(String(u._id));
    expect(res.body.authUserId).toBe(String(u._id));
  });

  it('authed user with demo toggle: userId = sandbox, authUserId = real user', async () => {
    const real = await User.create({ email: 'real@example.com' });
    const sandbox = await User.create({
      email: 'sb@demo.local',
      isDemoSandbox: true,
      parentUserId: real._id,
    });
    real.activeProfileId = sandbox._id;
    await real.save();

    const res = await request(mkApp())
      .get('/whoami')
      .set('Cookie', `token=${jwtFor(real._id)}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(String(sandbox._id));
    expect(res.body.authUserId).toBe(String(real._id));
  });

  it('anonymous demo (demo cookie only): userId = sandbox, authUserId = null', async () => {
    const sandbox = await User.create({
      email: 'anon@demo.local',
      isDemoSandbox: true,
    });
    const res = await request(mkApp())
      .get('/whoami')
      .set('Cookie', `${DEMO_COOKIE_NAME}=${signDemoToken(sandbox._id)}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(String(sandbox._id));
    expect(res.body.authUserId).toBeNull();
  });

  it('anonymous demo gets 403 on auth-only route', async () => {
    const sandbox = await User.create({
      email: 'anon@demo.local',
      isDemoSandbox: true,
    });
    const res = await request(mkApp())
      .get('/auth-only')
      .set('Cookie', `${DEMO_COOKIE_NAME}=${signDemoToken(sandbox._id)}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/demo/i);
  });

  it('authed user passes auth-only route even with demo toggle on', async () => {
    const real = await User.create({ email: 'real@example.com' });
    const sandbox = await User.create({
      email: 'sb@demo.local',
      isDemoSandbox: true,
      parentUserId: real._id,
    });
    real.activeProfileId = sandbox._id;
    await real.save();
    const res = await request(mkApp())
      .get('/auth-only')
      .set('Cookie', `token=${jwtFor(real._id)}`);
    expect(res.status).toBe(200);
  });

  it('demo cookie pointing at deleted sandbox = 401, no crash', async () => {
    const sandbox = await User.create({
      email: 'gone@demo.local',
      isDemoSandbox: true,
    });
    const token = signDemoToken(sandbox._id);
    await User.deleteMany({});
    const res = await request(mkApp())
      .get('/whoami')
      .set('Cookie', `${DEMO_COOKIE_NAME}=${token}`);
    expect(res.status).toBe(401);
  });

  it('demo cookie pointing at non-sandbox user = 401', async () => {
    const real = await User.create({ email: 'plain@example.com' });
    const res = await request(mkApp())
      .get('/whoami')
      .set('Cookie', `${DEMO_COOKIE_NAME}=${signDemoToken(real._id)}`);
    expect(res.status).toBe(401);
  });
});
