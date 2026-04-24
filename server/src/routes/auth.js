import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../services/email.js';
import { childLogger, errContext } from '../lib/logger.js';

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

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function validatePassword(pw) {
  if (typeof pw !== 'string') return 'Password required';
  if (pw.length < 8) return 'Password must be at least 8 characters';
  if (pw.length > 200) return 'Password too long';
  return null;
}

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
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
  message: { error: 'Too many attempts, try again later' },
  handler: (req, res, next, options) => {
    (req.log || log).warn({ ip: req.ip }, 'rate limit: login');
    res.status(options.statusCode).json(options.message);
  },
});

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

  const token = signToken(user._id);
  res.cookie('token', token, COOKIE_OPTS);

  sendWelcomeEmail(user.email).catch((err) => {
    rlog.error({ ...errContext(err), userId: String(user._id) }, 'register: welcome email failed');
  });

  res.status(201).json({ user: { id: user._id, email: user.email } });
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

  res.json({ user: { id: user._id, email: user.email } });
});

router.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    user: {
      id: u._id,
      email: u.email,
      displayName: u.displayName || null,
      isAdmin: Boolean(u.isAdmin),
      plan: u.plan,
      planActivatedAt: u.planActivatedAt,
      planExpiresAt: u.planExpiresAt,
      hasStripeCustomer: Boolean(u.stripeCustomerId),
      hasActiveSubscription: Boolean(u.stripeSubscriptionId),
    },
  });
});

router.patch('/me', requireAuth, async (req, res) => {
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
  const user = await User.findByIdAndUpdate(req.userId, { $set: update }, { new: true })
    .select('-passwordHash');
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  rlog.info({ userId: String(user._id), fields: Object.keys(update) }, 'auth: profile updated');
  res.json({
    user: {
      id: user._id,
      email: user.email,
      displayName: user.displayName || null,
      isAdmin: Boolean(user.isAdmin),
      plan: user.plan,
      planActivatedAt: user.planActivatedAt,
      planExpiresAt: user.planExpiresAt,
      hasStripeCustomer: Boolean(user.stripeCustomerId),
      hasActiveSubscription: Boolean(user.stripeSubscriptionId),
    },
  });
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
