import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../services/email.js';

const router = Router();

// sameSite=none is required when the frontend and API live on different
// eTLD+1 domains, and the browser then also requires secure=true.
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
// Precomputed bcrypt hash of a random string — used to equalize login timing
// when the email is not found, so attackers can't distinguish missing vs wrong-password.
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
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again later' },
});

router.post('/register', registerLimiter, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  const password = req.body?.password;

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash });

  const token = signToken(user._id);
  res.cookie('token', token, COOKIE_OPTS);

  sendWelcomeEmail(user.email).catch((err) => {
    console.error('[auth] welcome email failed:', err.message);
  });

  res.status(201).json({ user: { id: user._id, email: user.email } });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  const hash = user ? user.passwordHash : DUMMY_HASH;
  const valid = await bcrypt.compare(password, hash);
  if (!user || !valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signToken(user._id);
  res.cookie('token', token, COOKIE_OPTS);

  res.json({ user: { id: user._id, email: user.email } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user._id, email: req.user.email } });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  // Always respond OK — don't reveal whether an account exists.
  const genericOk = { ok: true };

  if (!email || !EMAIL_RE.test(email)) {
    return res.json(genericOk);
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.json(genericOk);
  }

  // Skip issuing a fresh token if one was minted very recently — prevents
  // attackers from flooding a victim's inbox via distributed IPs.
  if (
    user.passwordResetExpiresAt &&
    user.passwordResetExpiresAt.getTime() - RESET_TOKEN_TTL_MS > Date.now() - RESET_RESEND_MIN_MS
  ) {
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
  } catch (err) {
    console.error('[auth] reset email failed:', err.message);
    // Still return generic OK to preserve anti-enumeration.
  }

  res.json(genericOk);
});

router.post('/reset-password', resetLimiter, async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired reset link' });
  }

  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordResetTokenHash = null;
  user.passwordResetExpiresAt = null;
  await user.save();

  res.json({ ok: true });
});

export default router;
