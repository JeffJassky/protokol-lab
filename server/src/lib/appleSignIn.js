import { createRemoteJWKSet, jwtVerify } from 'jose';
import { childLogger } from './logger.js';

const log = childLogger('apple-signin');

// Apple's published OIDC keys. Used to verify identity tokens issued by
// "Sign in with Apple". jose caches the keyset internally and revalidates
// on cache miss, so we can construct the JWKS once at module load.
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

let jwks = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  return jwks;
}

// Apple uses different audiences depending on platform:
//   - Native iOS: aud = your app's bundle ID (e.g. com.protokollab.app)
//   - Web (Sign in with Apple JS): aud = your Service ID
// Accept either so the same backend route serves both flows.
function getAcceptedAudiences() {
  const bundle = process.env.APPLE_BUNDLE_ID || '';
  const service = process.env.APPLE_SERVICE_ID || '';
  return [bundle, service].filter(Boolean);
}

export function isAppleSignInConfigured() {
  return getAcceptedAudiences().length > 0;
}

// Verify an Apple identity token (JWT). Returns the decoded payload on
// success, throws on any verification failure (signature mismatch, expired
// token, wrong issuer/audience, missing required claims).
//
// Notes on the payload:
//   - `sub`         stable Apple user id, never changes for this user+team
//   - `email`       only present on FIRST sign-in (or if user opts in to
//                   share). Subsequent sign-ins return `sub` only.
//   - `email_verified`  Apple normalizes this to a string `'true'`/`'false'`
//                   in the JWT; we coerce to boolean below.
//   - `is_private_email`  true when the user used "Hide My Email" — the
//                   address is a per-app relay (@privaterelay.appleid.com).
export async function verifyAppleIdToken(idToken, { nonce } = {}) {
  if (!isAppleSignInConfigured()) {
    throw new Error('Apple Sign-In is not configured');
  }
  const audiences = getAcceptedAudiences();

  const { payload } = await jwtVerify(idToken, getJwks(), {
    issuer: APPLE_ISSUER,
    audience: audiences,
  });

  if (!payload.sub) {
    throw new Error('Apple identity token missing sub claim');
  }

  // Optional anti-replay nonce — only enforced if the caller provides one.
  // The native iOS plugin doesn't currently send a nonce; the web JS SDK
  // can. When present we require an exact match; otherwise we skip.
  if (nonce && payload.nonce !== nonce) {
    throw new Error('Apple identity token nonce mismatch');
  }

  // Coerce email_verified to a real boolean. Apple sometimes ships it as a
  // string ('true' / 'false'), other times as a boolean — normalize both.
  const emailVerified = payload.email_verified === true
    || payload.email_verified === 'true';

  return {
    sub: String(payload.sub),
    email: payload.email ? String(payload.email).toLowerCase().trim() : null,
    emailVerified,
    isPrivateEmail: payload.is_private_email === true
      || payload.is_private_email === 'true',
  };
}

// Some flows (e.g. iOS plugin's first sign-in) provide a display name that
// Apple does NOT bake into the identity token — it's surfaced separately
// from the authorization response. The server route accepts it as an
// untrusted hint to seed displayName on user creation.
export function sanitizeAppleDisplayName(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const given = String(raw.givenName || '').trim();
  const family = String(raw.familyName || '').trim();
  const full = [given, family].filter(Boolean).join(' ').slice(0, 60);
  return full || null;
}

// Diagnostic helper used by /api/auth/apple to log verification context
// without leaking the full token. Strips signature, returns header + body.
export function previewToken(idToken) {
  try {
    const [, body] = idToken.split('.');
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return { sub: decoded.sub, aud: decoded.aud, iss: decoded.iss, exp: decoded.exp };
  } catch (err) {
    log.debug({ err: err.message }, 'apple token preview failed');
    return null;
  }
}
