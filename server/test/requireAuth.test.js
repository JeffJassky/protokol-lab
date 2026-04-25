// Unit-test the requireAuth middleware in isolation. We don't need the full
// app — mount it on a throwaway Express instance with a tiny protected route.
//
// Covers: no cookie, tampered cookie, wrong-secret cookie, expired cookie,
// deleted user, happy path (userId + req.user attached).

import { describe, it, expect } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../src/middleware/requireAuth.js';
import User from '../src/models/User.js';

function mkApp() {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', requireAuth, (req, res) => {
    res.json({
      userId: String(req.userId),
      email: req.user.email,
      hasPasswordHash: Boolean(req.user.passwordHash),
    });
  });
  return app;
}

async function mkUser() {
  return User.create({ email: 'mw@example.com', passwordHash: 'hash' });
}

function tokenFor(userId, { secret = process.env.JWT_SECRET, expiresIn = '7d' } = {}) {
  return jwt.sign({ userId }, secret, { expiresIn });
}

describe('requireAuth', () => {
  it('401 when no cookie', async () => {
    const res = await request(mkApp()).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not authenticated/i);
  });

  it('401 when cookie is malformed garbage', async () => {
    const res = await request(mkApp())
      .get('/protected')
      .set('Cookie', 'token=not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid token/i);
  });

  it('401 when signed with wrong secret', async () => {
    const user = await mkUser();
    const bad = tokenFor(user._id, { secret: 'other-secret' });
    const res = await request(mkApp())
      .get('/protected')
      .set('Cookie', `token=${bad}`);
    expect(res.status).toBe(401);
  });

  it('401 when token expired', async () => {
    const user = await mkUser();
    const expired = tokenFor(user._id, { expiresIn: '-1s' });
    const res = await request(mkApp())
      .get('/protected')
      .set('Cookie', `token=${expired}`);
    expect(res.status).toBe(401);
  });

  it('401 when token valid but user row was deleted', async () => {
    const user = await mkUser();
    const good = tokenFor(user._id);
    await User.deleteMany({});
    const res = await request(mkApp())
      .get('/protected')
      .set('Cookie', `token=${good}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/user not found/i);
  });

  it('attaches userId + user to req on success, strips passwordHash', async () => {
    const user = await mkUser();
    const good = tokenFor(user._id);
    const res = await request(mkApp())
      .get('/protected')
      .set('Cookie', `token=${good}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(String(user._id));
    expect(res.body.email).toBe(user.email);
    expect(res.body.hasPasswordHash).toBe(false);
  });
});
