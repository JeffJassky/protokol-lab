import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import {
  verifyAppleIdToken,
  isAppleSignInConfigured,
  sanitizeAppleDisplayName,
  previewToken,
} from '../lib/appleSignIn.js';
import User from '../models/User.js';
import { requireAuth, requireAuthUser } from '../middleware/requireAuth.js';
import { sendPasswordResetEmail, sendWelcomeEmail, sendAccountDeletedEmail } from '../services/email.js';
import { deleteUser } from '../services/userDeletion.js';
import { readDemoCookie, verifyDemoToken, clearDemoCookie } from '../lib/demoSession.js';
import { emitDemoEvent } from '../lib/demoEvents.js';
import { insertFunnelEvent } from '../lib/funnelEvents.js';
import { deleteSandbox } from '../services/demo.js';
import { childLogger, errContext } from '../lib/logger.js';
import FunnelEvent from '../models/FunnelEvent.js';
import { recordResetToken } from '../lib/testHelperState.js';

const log = childLogger('auth');
const router = Router();

const SAMESITE = process.env.COOKIE_SAMESITE || 'lax';
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: SAMESITE,
  secure: SAMESITE === 'none' || process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const RESET_TOKEN_TTL_MS = 120 * 60 * 1000;
const RESET_RESEND_MIN_MS = 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.q2FujYYQH3VjXm9gxzQc.IgXe3uS';

// Demo is pre-register only. On every successful login we (a) drop any anon
// demo cookie + delete its sandbox, and (b) wipe any parented sandbox left
// over from the legacy "authed-toggle into demo" feature, clearing
// activeProfileId so requireAuth stops dereferencing it.
async function wipeDemoForAuthedSession({ req, res, userId, rlog }) {
  const demoSandboxId = verifyDemoToken(readDemoCookie(req));
  if (demoSandboxId) {
    clearDemoCookie(res);
    await deleteSandbox(demoSandboxId).catch((err) => {
      rlog.error(
        { ...errContext(err), sandboxId: String(demoSandboxId) },
        'auth: failed to delete anon demo sandbox on login',
      );
    });
  }

  const parented = await User.find({
    parentUserId: userId,
    isDemoSandbox: true,
  }).select('_id').lean();
  for (const sb of parented) {
    await deleteSandbox(sb._id).catch((err) => {
      rlog.error(
        { ...errContext(err), sandboxId: String(sb._id) },
        'auth: failed to delete parented demo sandbox on login',
      );
    });
  }
  await User.updateOne({ _id: userId }, { $set: { activeProfileId: null } });
}

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Native (Capacitor) clients opt into Bearer auth by sending this header.
// They get the JWT in the response JSON in addition to the cookie. Web
// clients don't send it, so they never see the JWT in a JS-readable surface
// — cookie-only auth keeps its threat model.
function wantsBearer(req) {
  return req.headers['x-auth-mode'] === 'bearer';
}

// Backfill the freshly-bound userId onto every FunnelEvent that shares
// this anonId. Lets the admin funnel join a /pricing page_view → demo
// → register sequence into one row keyed by user. Best-effort: never
// throws into the auth flow.
async function stitchAnonToUser(anonId, userId, rlog) {
  if (!anonId || !userId) return;
  try {
    const result = await FunnelEvent.updateMany(
      { anonId, userId: null },
      { $set: { userId } },
    );
    rlog.info(
      { anonId, userId: String(userId), matched: result.matchedCount, modified: result.modifiedCount },
      'funnel: stitched anon→user',
    );
  } catch (err) {
    rlog.warn({ ...errContext(err), anonId, userId: String(userId) }, 'funnel: stitch failed');
  }
}

function serializeUser(u) {
  return {
    id: u._id,
    email: u.email,
    displayName: u.displayName || null,
    isAdmin: Boolean(u.isAdmin),
    plan: u.plan,
    planActivatedAt: u.planActivatedAt,
    planExpiresAt: u.planExpiresAt,
    hasStripeCustomer: Boolean(u.stripeCustomerId),
    hasActiveSubscription: Boolean(u.stripeSubscriptionId),
    // Drives the delete-account UI: password accounts get a password-challenge
    // field; OAuth-only accounts get a confirm checkbox.
    hasPassword: Boolean(u.passwordHash),
    imageRecognitionCount: u.imageRecognitionCount || 0,
    onboardingComplete: Boolean(u.onboardingComplete),
    onboardingStep: u.onboardingStep || 'basics',
  };
}

const ONBOARDING_STEPS = [
  'basics', 'activity', 'goal', 'targets', 'compounds', 'install', 'notifications', 'done',
];

function validatePassword(pw) {
  if (typeof pw !== 'string') return 'Password required';
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 200) return 'Password too long';
  return null;
}

// Tests share a single app instance + fixed IP (127.0.0.1), so rate-limit
// counters bleed across specs and cause spurious 429s. Skip in test/e2e envs;
// prod behavior unchanged.
const skipInTest = () =>
  process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e';

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many attempts, try again later' },
  handler: (req, res, next, options) => {
    (req.log || log).warn({ ip: req.ip, path: req.path }, 'rate limit: register');
    res.status(options.statusCode).json(options.message);
  },
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many attempts, try again later' },
  handler: (req, res, next, options) => {
    (req.log || log).warn({ ip: req.ip }, 'rate limit: forgot-password');
    res.status(options.statusCode).json(options.message);
  },
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many attempts, try again later' },
  handler: (req, res, next, options) => {
    (req.log || log).warn({ ip: req.ip }, 'rate limit: reset-password');
    res.status(options.statusCode).json(options.message);
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'Too many attempts, try again later' },
  handler: (req, res, next, options) => {
    (req.log || log).warn({ ip: req.ip }, 'rate limit: login');
    res.status(options.statusCode).json(options.message);
  },
});

// Lazy singleton — client is only constructed on first /google call so that
// boot does not require GOOGLE_CLIENT_ID. Tests can mock OAuth2Client at the
// module level without it ever being instantiated.
let googleClient = null;
function getGoogleClient() {
  if (!googleClient) googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  return googleClient;
}

router.post('/register', registerLimiter, async (req, res) => {
  const rlog = req.log || log;
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  const password = req.body?.password;

  if (!email || !EMAIL_RE.test(email)) {
    rlog.warn({ email }, 'register: invalid email');
    return res.status(400).json({ error: 'Valid email required' });
  }
  const pwError = validatePassword(password);
  if (pwError) {
    rlog.warn({ email, reason: pwError }, 'register: invalid password');
    return res.status(400).json({ error: pwError });
  }

  const existing = await User.findOne({ email });
  if (existing) {
    rlog.warn({ email }, 'register: email already exists');
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash });
  rlog.info({ userId: String(user._id), email }, 'register: new user created');

  await stitchAnonToUser(req.anonId, user._id, rlog);

  const token = signToken(user._id);
  res.cookie('token', token, COOKIE_OPTS);

  // If this signup completed an anonymous demo session, drop the cookie,
  // emit a convert event, and delete the sandbox doc so it doesn't linger
  // as an orphan. Demo is pre-register only — once you have an account,
  // the sandbox is gone.
  const demoSandboxId = verifyDemoToken(readDemoCookie(req));
  if (demoSandboxId) {
    clearDemoCookie(res);
    emitDemoEvent(req, 'demo_signup_convert', {
      sandboxId: demoSandboxId,
      newUserId: String(user._id),
    });
    await deleteSandbox(demoSandboxId).catch((err) => {
      rlog.error(
        { ...errContext(err), sandboxId: String(demoSandboxId) },
        'register: failed to delete anon demo sandbox',
      );
    });
  }

  sendWelcomeEmail(user.email).catch((err) => {
    rlog.error({ ...errContext(err), userId: String(user._id) }, 'register: welcome email failed');
  });

  const body = { user: serializeUser(user) };
  if (wantsBearer(req)) body.token = token;
  res.status(201).json(body);
});

router.post('/login', loginLimiter, async (req, res) => {
  const rlog = req.log || log;
  const { email, password } = req.body;
  if (!email || !password) {
    rlog.warn('login: missing credentials');
    return res.status(400).json({ error: 'Email and password required' });
  }

  const normalized = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalized });
  const hash = user ? user.passwordHash : DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid) {
    rlog.warn({ email: normalized, userFound: Boolean(user) }, 'login: invalid credentials');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken(user._id);
  res.cookie('token', token, COOKIE_OPTS);
  rlog.info({ userId: String(user._id), email: normalized }, 'login: success');

  await stitchAnonToUser(req.anonId, user._id, rlog);
  await wipeDemoForAuthedSession({ req, res, userId: user._id, rlog });

  const body = { user: serializeUser(user) };
  if (wantsBearer(req)) body.token = token;
  res.json(body);
});

// Google Identity Services flow: client gets an ID token from the GIS popup
// and POSTs the raw JWT here as `credential`. We verify it server-side against
// Google's published keys (handled inside verifyIdToken), then either log in,
// auto-link by email, or create a new user. Auto-link is safe because Google
// signals email verification via the `email_verified` claim — we require it.
router.post('/google', loginLimiter, async (req, res) => {
  const rlog = req.log || log;
  const credential = typeof req.body?.credential === 'string' ? req.body.credential : '';
  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    rlog.error('google sign-in: GOOGLE_CLIENT_ID not configured');
    return res.status(503).json({ error: 'Google sign-in not configured' });
  }

  let payload;
  try {
    const ticket = await getGoogleClient().verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    rlog.warn({ ...errContext(err) }, 'google sign-in: token verification failed');
    return res.status(401).json({ error: 'Invalid Google credential' });
  }

  if (!payload?.sub || !payload?.email) {
    rlog.warn({ payload: { hasSub: Boolean(payload?.sub), hasEmail: Boolean(payload?.email) } }, 'google sign-in: payload missing required claims');
    return res.status(401).json({ error: 'Invalid Google credential' });
  }
  if (!payload.email_verified) {
    rlog.warn({ email: payload.email }, 'google sign-in: email not verified by Google');
    return res.status(401).json({ error: 'Google email not verified' });
  }

  const googleId = payload.sub;
  const email = String(payload.email).toLowerCase().trim();
  const avatarUrl = payload.picture || null;
  const displayName = payload.name || null;

  let user = await User.findOne({ googleId });
  let created = false;

  if (!user) {
    // Auto-link to an existing email/password account, or create new.
    user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      if (!user.avatarUrl && avatarUrl) user.avatarUrl = avatarUrl;
      if (!user.displayName && displayName) user.displayName = displayName;
      await user.save();
      rlog.info({ userId: String(user._id), email }, 'google sign-in: auto-linked existing account');
    } else {
      user = await User.create({
        email,
        googleId,
        avatarUrl,
        displayName,
      });
      created = true;
      rlog.info({ userId: String(user._id), email }, 'google sign-in: new user created');
    }
  } else {
    rlog.info({ userId: String(user._id), email: user.email }, 'google sign-in: success');
  }

  const token = signToken(user._id);
  res.cookie('token', token, COOKIE_OPTS);

  if (created) {
    sendWelcomeEmail(user.email).catch((err) => {
      rlog.error({ ...errContext(err), userId: String(user._id) }, 'google sign-in: welcome email failed');
    });
  }

  await stitchAnonToUser(req.anonId, user._id, rlog);
  await wipeDemoForAuthedSession({ req, res, userId: user._id, rlog });

  const body = { user: serializeUser(user) };
  if (wantsBearer(req)) body.token = token;
  res.status(created ? 201 : 200).json(body);
});

// Sign in with Apple. The client (iOS native plugin or web JS SDK) hands us
// the identity token; we verify it against Apple's published JWKS, then
// look up / auto-link / create the user the same way the Google route does.
//
// Apple quirks:
//   - `email` is only present on the FIRST sign-in for a user. Subsequent
//     sign-ins return `sub` only. Must look up by `appleId` first.
//   - Apple "Hide My Email" surfaces a `@privaterelay.appleid.com` address.
//     Treat it as verified — Apple guarantees deliverability through relay.
//   - Display name is NOT in the JWT; the iOS plugin / web SDK passes it
//     separately as { givenName, familyName }. Optional, untrusted hint.
router.post('/apple', loginLimiter, async (req, res) => {
  const rlog = req.log || log;
  const idToken = typeof req.body?.identityToken === 'string' ? req.body.identityToken : '';
  const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce : null;
  const nameHint = req.body?.fullName || null;

  if (!idToken) {
    return res.status(400).json({ error: 'Missing identityToken' });
  }
  if (!isAppleSignInConfigured()) {
    rlog.error('apple sign-in: APPLE_BUNDLE_ID / APPLE_SERVICE_ID not configured');
    return res.status(503).json({ error: 'Apple sign-in not configured' });
  }

  let claims;
  try {
    claims = await verifyAppleIdToken(idToken, nonce ? { nonce } : {});
  } catch (err) {
    rlog.warn(
      { ...errContext(err), tokenPreview: previewToken(idToken) },
      'apple sign-in: token verification failed',
    );
    return res.status(401).json({ error: 'Invalid Apple credential' });
  }

  const appleId = claims.sub;
  const email = claims.email;
  // Apple only marks email_verified=true for real addresses. Private-relay
  // addresses come back without email_verified set explicitly but Apple
  // guarantees they route to the user — accept those too.
  const emailUsable = !!email && (claims.emailVerified || claims.isPrivateEmail);

  let user = await User.findOne({ appleId });
  let created = false;

  if (!user) {
    if (!emailUsable) {
      // First-time sign-in MUST include a usable email. If the user
      // previously revoked this app on appleid.apple.com, Apple drops the
      // email on the next sign-in and there's nothing to link by — bail
      // with guidance rather than create an emailless ghost account.
      rlog.warn(
        { hasEmail: !!email, isPrivateEmail: claims.isPrivateEmail, verified: claims.emailVerified },
        'apple sign-in: first-time sign-in without a usable email',
      );
      return res.status(409).json({
        error: 'Apple sign-in did not return an email. In iOS Settings, revoke "Protokol Lab" under your Apple ID and try again.',
      });
    }

    user = await User.findOne({ email });
    if (user) {
      user.appleId = appleId;
      const sanitized = sanitizeAppleDisplayName(nameHint);
      if (!user.displayName && sanitized) user.displayName = sanitized;
      await user.save();
      rlog.info({ userId: String(user._id), email }, 'apple sign-in: auto-linked existing account');
    } else {
      user = await User.create({
        email,
        appleId,
        displayName: sanitizeAppleDisplayName(nameHint),
      });
      created = true;
      rlog.info({ userId: String(user._id), email }, 'apple sign-in: new user created');
    }
  } else {
    rlog.info({ userId: String(user._id), email: user.email }, 'apple sign-in: success');
  }

  const token = signToken(user._id);
  res.cookie('token', token, COOKIE_OPTS);

  if (created) {
    sendWelcomeEmail(user.email).catch((err) => {
      rlog.error({ ...errContext(err), userId: String(user._id) }, 'apple sign-in: welcome email failed');
    });
  }

  await stitchAnonToUser(req.anonId, user._id, rlog);
  await wipeDemoForAuthedSession({ req, res, userId: user._id, rlog });

  const body = { user: serializeUser(user) };
  if (wantsBearer(req)) body.token = token;
  res.status(created ? 201 : 200).json(body);
});

router.get('/me', requireAuth, requireAuthUser, (req, res) => {
  // `minAppVersion` lets us force native binaries below a known floor to
  // update before they hit a breaking API change. Env-driven so we can
  // bump the floor without a code release. Web clients don't carry an
  // X-App-Version header and ignore this field.
  const minAppVersion = process.env.MIN_APP_VERSION || null;
  res.json({ user: serializeUser(req.user), minAppVersion });
});

// Account deletion. Apple App Store guideline 5.1.1(v) requires this to be
// available in-app for any app that allows account creation. The cascade
// hook on User (`models/User.js`) handles child sandboxes, S3 keys (photos,
// support attachments), Stripe customer deletion (which auto-cancels every
// subscription), and the 21 collections in CASCADE_COLLECTIONS — so this
// route only re-authenticates the user, fires the cascade, sends a
// confirmation email, and clears auth state.
router.delete('/me', requireAuth, requireAuthUser, async (req, res) => {
  const rlog = req.log || log;
  const user = req.user;

  // Re-auth as defense-in-depth against CSRF + accidental clicks. Password
  // accounts must re-enter the password. OAuth-only accounts (no passwordHash)
  // just need an explicit `confirm:true` flag — the live session is the
  // credential, and there's no password to challenge against.
  if (user.passwordHash) {
    const password = req.body?.password;
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'password_required' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      rlog.warn({ userId: String(user._id) }, 'delete-account: password mismatch');
      return res.status(401).json({ error: 'invalid_password' });
    }
  } else if (req.body?.confirm !== true) {
    return res.status(400).json({ error: 'confirmation_required' });
  }

  const email = user.email;

  try {
    await deleteUser(user._id);
  } catch (err) {
    rlog.error({ ...errContext(err), userId: String(user._id) }, 'delete-account: cascade failed');
    return res.status(500).json({ error: 'deletion_failed' });
  }

  rlog.info({ userId: String(user._id), email }, 'delete-account: success');

  // Fire-and-forget — a SendGrid hiccup must not block the deletion response,
  // and the row is already gone so retries are pointless.
  sendAccountDeletedEmail(email).catch((err) => {
    rlog.warn({ ...errContext(err), email }, 'delete-account: confirmation email failed');
  });

  res.clearCookie('token');
  res.json({ ok: true });
});

router.patch('/me', requireAuth, requireAuthUser, async (req, res) => {
  const rlog = req.log || log;
  const update = {};
  if (req.body?.displayName !== undefined) {
    const raw = typeof req.body.displayName === 'string' ? req.body.displayName.trim() : '';
    if (raw.length > 60) {
      return res.status(400).json({ error: 'Display name too long (max 60)' });
    }
    update.displayName = raw || null;
  }
  if (!Object.keys(update).length) {
    return res.status(400).json({ error: 'nothing_to_update' });
  }
  const user = await User.findByIdAndUpdate(req.authUserId, { $set: update }, { new: true })
    .select('-passwordHash');
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  rlog.info({ userId: String(user._id), fields: Object.keys(update) }, 'auth: profile updated');
  res.json({ user: serializeUser(user) });
});

router.post('/onboarding/step', requireAuth, requireAuthUser, async (req, res) => {
  const step = req.body?.step;
  if (!ONBOARDING_STEPS.includes(step)) {
    return res.status(400).json({ error: 'invalid step' });
  }
  const user = await User.findByIdAndUpdate(
    req.authUserId,
    { $set: { onboardingStep: step } },
    { new: true },
  ).select('-passwordHash');
  (req.log || log).info({ userId: String(user._id), step }, 'onboarding: step updated');
  res.json({ user: serializeUser(user) });
});

router.post('/onboarding/complete', requireAuth, requireAuthUser, async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.authUserId,
    { $set: { onboardingComplete: true, onboardingStep: 'done' } },
    { new: true },
  ).select('-passwordHash');
  (req.log || log).info({ userId: String(user._id) }, 'onboarding: complete');
  // Skip funnel persistence for synthetic probes — log line above stays
  // for observability. Same pattern as lib/demoEvents.js.
  if (!req.headers['x-synthetic-probe']) {
    insertFunnelEvent({
      name: 'onboarding_complete',
      anonId: req.anonId || null,
      userId: user._id,
      ua: req.headers['user-agent'] || null,
      ip: req.ip || null,
    });
  }
  res.json({ user: serializeUser(user) });
});

router.post('/logout', (req, res) => {
  (req.log || log).info('logout');
  res.clearCookie('token');
  res.json({ ok: true });
});

router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const rlog = req.log || log;
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  const genericOk = { ok: true };

  if (!email || !EMAIL_RE.test(email)) {
    rlog.debug('forgot-password: invalid email format (silent ok)');
    return res.json(genericOk);
  }

  const user = await User.findOne({ email });
  if (!user) {
    rlog.debug({ email }, 'forgot-password: no account (silent ok)');
    return res.json(genericOk);
  }

  if (
    user.passwordResetExpiresAt &&
    user.passwordResetExpiresAt.getTime() - RESET_TOKEN_TTL_MS > Date.now() - RESET_RESEND_MIN_MS
  ) {
    rlog.info({ userId: String(user._id) }, 'forgot-password: throttled, token still fresh');
    return res.json(genericOk);
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();

  // E2E side channel — defense in depth: gate at the call site too, even
  // though recordResetToken self-checks NODE_ENV. A future change to the
  // helper that loosens its check shouldn't silently start storing raw
  // reset tokens in process memory in production.
  if (process.env.NODE_ENV === 'e2e') {
    recordResetToken(user.email, rawToken);
  }

  const appUrl = process.env.APP_URL || '';
  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail(user.email, resetUrl);
    rlog.info({ userId: String(user._id) }, 'forgot-password: reset email sent');
  } catch (err) {
    rlog.error({ ...errContext(err), userId: String(user._id) }, 'forgot-password: reset email failed');
  }

  res.json(genericOk);
});

router.post('/reset-password', resetLimiter, async (req, res) => {
  const rlog = req.log || log;
  const { token, password } = req.body || {};
  if (!token || typeof token !== 'string') {
    rlog.warn('reset-password: missing/invalid token');
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }
  const pwError = validatePassword(password);
  if (pwError) {
    rlog.warn({ reason: pwError }, 'reset-password: invalid password');
    return res.status(400).json({ error: pwError });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    rlog.warn('reset-password: token not found or expired');
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  await user.save();
  rlog.info({ userId: String(user._id) }, 'reset-password: success');

  res.json({ ok: true });
});

export default router;
