// Anonymous demo session token. Issued when a cold visitor clicks "Try the
// demo" — there is no JWT yet, so we mint a separate signed token whose only
// claim is the sandbox id they were assigned. requireAuth checks this when
// no JWT cookie is present, letting demo visitors hit the same data routes
// as real users without a registered account.
//
// Auth-only routes (billing, push subscribe, account settings) detect demo
// sessions via req.authUserId === null and reject.

import jwt from 'jsonwebtoken';

const COOKIE_NAME = 'demo_token';
// Demo sessions live up to the cleanup window (anon sandboxes nuked at 24h
// of inactivity). The token TTL just needs to outlive a typical exploration.
const TTL_SECONDS = 24 * 60 * 60;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: process.env.COOKIE_SAMESITE || 'lax',
  secure:
    (process.env.COOKIE_SAMESITE || 'lax') === 'none'
    || process.env.NODE_ENV === 'production',
  maxAge: TTL_SECONDS * 1000,
};

export function signDemoToken(sandboxUserId) {
  return jwt.sign(
    { type: 'demo', sandboxId: String(sandboxUserId) },
    process.env.JWT_SECRET,
    { expiresIn: TTL_SECONDS },
  );
}

export function verifyDemoToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload?.type !== 'demo' || !payload.sandboxId) return null;
    return payload.sandboxId;
  } catch {
    return null;
  }
}

export function setDemoCookie(res, sandboxUserId) {
  res.cookie(COOKIE_NAME, signDemoToken(sandboxUserId), COOKIE_OPTS);
}

export function clearDemoCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...COOKIE_OPTS, maxAge: undefined });
}

export function readDemoCookie(req) {
  return req.cookies?.[COOKIE_NAME] || null;
}

export const DEMO_COOKIE_NAME = COOKIE_NAME;
