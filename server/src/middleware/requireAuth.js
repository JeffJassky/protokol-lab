import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { readDemoCookie, verifyDemoToken } from '../lib/demoSession.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('auth');

// requireAuth resolves the request to a *data scope* (req.userId) and an
// *auth identity* (req.authUserId). They diverge in two cases:
//
//   1. Authed user with demo toggle on:
//        req.authUserId = real user id
//        req.userId     = sandbox user id (from user.activeProfileId)
//        req.user       = real user doc
//
//   2. Anonymous demo visitor (no JWT, valid demo cookie):
//        req.authUserId = null
//        req.userId     = sandbox user id (from demo cookie)
//        req.user       = sandbox user doc
//
// Routes that filter data on req.userId automatically scope to the right
// profile in either case. Routes that need the stable auth identity (auth,
// billing, push subscribe, AI quota) use req.authUserId — and the
// requireAuthUser middleware below rejects anonymous demo at those edges.

// Returns one of:
//   { kind: 'absent' }                         — no JWT cookie at all
//   { kind: 'invalid', reason: 'jwt' }         — JWT failed to verify
//   { kind: 'invalid', reason: 'missing' }     — JWT verified but user gone
//   { kind: 'ok', user }                       — happy path
async function loadAuthUser(token, req) {
  if (!token) return { kind: 'absent' };
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId).select('-passwordHash');
    if (!user) {
      (req.log || log).warn(
        { userId: String(payload.userId), path: req.path },
        'auth: token valid but user missing',
      );
      return { kind: 'invalid', reason: 'missing' };
    }
    return { kind: 'ok', user };
  } catch (err) {
    (req.log || log).warn({ ...errContext(err), path: req.path }, 'auth: jwt verify failed');
    return { kind: 'invalid', reason: 'jwt' };
  }
}

async function loadDemoSandbox(req) {
  const token = readDemoCookie(req);
  const sandboxId = verifyDemoToken(token);
  if (!sandboxId) return null;
  const sandbox = await User.findById(sandboxId);
  // Cookie can outlive a cleanup sweep — treat a missing or non-sandbox doc
  // as no session rather than 500.
  if (!sandbox || !sandbox.isDemoSandbox) return null;
  return sandbox;
}

// Throttle so we don't write to Mongo on every single request — only when
// the stamp is more than this stale.
const SANDBOX_TOUCH_THROTTLE_MS = 5 * 60 * 1000;

// Per-process record of the last time we wrote `lastActiveAt` for each
// sandbox. Lets the throttle work on the authed-toggle path too, where we
// don't have the persisted lastActiveAt loaded. Bounded growth: cleared
// opportunistically when entries age past the throttle window.
const recentTouches = new Map();

function touchSandboxAsync(sandboxId, lastActiveAt) {
  const id = String(sandboxId);
  const now = Date.now();

  // Persisted stamp wins when we have it (covers fresh anon requests where
  // this process never touched the sandbox before).
  if (lastActiveAt && now - new Date(lastActiveAt).getTime() < SANDBOX_TOUCH_THROTTLE_MS) {
    return;
  }
  const lastInProc = recentTouches.get(id);
  if (lastInProc && now - lastInProc < SANDBOX_TOUCH_THROTTLE_MS) {
    return;
  }

  recentTouches.set(id, now);
  // Best-effort prune so the map can't grow unbounded if a process serves
  // many distinct sandboxes over its lifetime.
  if (recentTouches.size > 1024) {
    const cutoff = now - SANDBOX_TOUCH_THROTTLE_MS;
    for (const [k, t] of recentTouches) {
      if (t < cutoff) recentTouches.delete(k);
    }
  }

  // Fire-and-forget: keeping the sandbox alive isn't on the critical path.
  User.updateOne({ _id: sandboxId }, { $set: { lastActiveAt: new Date() } }).catch((err) => {
    log.warn({ ...errContext(err), sandboxId: id }, 'auth: touch sandbox failed');
  });
}

export async function requireAuth(req, res, next) {
  const authResult = await loadAuthUser(req.cookies?.token, req);

  if (authResult.kind === 'ok') {
    const authUser = authResult.user;
    req.authUserId = authUser._id;
    req.user = authUser;
    // If the real user has a demo toggle on, the data scope shifts to the
    // sandbox. We don't re-load the sandbox doc on every request — queries
    // only need its id.
    req.userId = authUser.activeProfileId || authUser._id;
    if (req.log) req.log = req.log.child({ userId: String(authUser._id) });
    if (authUser.activeProfileId) {
      // We don't have the sandbox's persisted lastActiveAt loaded here —
      // the in-process throttle in touchSandboxAsync keeps this from
      // turning into a write per request.
      touchSandboxAsync(authUser.activeProfileId, null);
    }
    return next();
  }

  // A bad JWT cookie is itself an error — don't silently fall through to
  // the demo path, surface it so the client can clear stale tokens.
  if (authResult.kind === 'invalid') {
    const message = authResult.reason === 'missing' ? 'User not found' : 'Invalid token';
    return res.status(401).json({ error: message });
  }

  // No JWT cookie at all — try anonymous demo cookie.
  const sandbox = await loadDemoSandbox(req);
  if (sandbox) {
    req.authUserId = null;
    req.userId = sandbox._id;
    req.user = sandbox;
    if (req.log) req.log = req.log.child({ demoSandbox: String(sandbox._id) });
    touchSandboxAsync(sandbox._id, sandbox.lastActiveAt);
    return next();
  }

  (req.log || log).warn({ path: req.path }, 'auth: no valid session');
  return res.status(401).json({ error: 'Not authenticated' });
}

// Use this on routes that must run as a real authenticated user (billing,
// push subscribe, account settings). Rejects anonymous demo sessions even
// though they pass requireAuth. Authed users with demo toggle on still pass
// — billing and push are tied to the real account regardless of toggle.
export function requireAuthUser(req, res, next) {
  if (!req.authUserId) {
    return res.status(403).json({ error: 'Not available in demo mode' });
  }
  next();
}

// Stricter: requires the *active profile* to be the user's real data, not a
// sandbox. Blocks both anonymous demo and authed-with-toggle. Use for
// features that don't make sense or are too costly to expose in demo
// (currently the AI agent — see PRD §10 / step 11).
export function requireRealProfile(req, res, next) {
  if (!req.authUserId || String(req.userId) !== String(req.authUserId)) {
    return res.status(403).json({
      error: 'demo_unavailable',
      message: 'This feature is only available on your real account. Exit demo mode to continue.',
    });
  }
  next();
}
