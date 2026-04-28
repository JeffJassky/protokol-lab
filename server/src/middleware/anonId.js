import crypto from 'crypto';

// Long-lived anonymous identifier. One per browser; persists across the
// demo→register transition so funnel events can be stitched into a
// single visitor journey at register time.
//
// Not a tracking super-cookie: not derivable from PII, not synced
// server-side beyond the events table, cleared by clearing site cookies.

export const ANON_ID_COOKIE = 'bo_aid';
const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function generate() {
  // 16 bytes base64url — 22 chars, ~128 bits of entropy.
  return crypto.randomBytes(16).toString('base64url');
}

export function ensureAnonId(req, res, next) {
  const existing = req.cookies?.[ANON_ID_COOKIE];
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) {
    req.anonId = existing;
    return next();
  }
  const id = generate();
  req.anonId = id;
  const sameSite = process.env.COOKIE_SAMESITE || 'lax';
  // Pin Secure to whether the request actually arrived over TLS. SameSite=None
  // forces it on (browsers reject SameSite=None without Secure). Otherwise
  // trust req.secure (set by trust-proxy + X-Forwarded-Proto) so a staging
  // env on HTTPS gets the flag even when NODE_ENV != 'production'.
  const secure = sameSite === 'none' || req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(ANON_ID_COOKIE, id, {
    httpOnly: true,
    sameSite,
    secure,
    maxAge: TWO_YEARS_MS,
    path: '/',
  });
  next();
}
