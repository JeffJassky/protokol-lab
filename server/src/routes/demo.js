// Demo mode entry/exit endpoints.
//
//   POST /api/demo/start   — anonymous: mint a sandbox + set demo cookie.
//                            IP-rate-limited so a bot can't spawn thousands.
//   POST /api/demo/enter   — authed:    create-or-reuse a parented sandbox
//                            and set activeProfileId so requireAuth swaps
//                            req.userId on subsequent requests.
//   POST /api/demo/exit    — authed:    clear activeProfileId, return to real data.
//   POST /api/demo/reset   — authed:    nuke + reclone the user's sandbox
//                            (used when the canonical template was updated).
//   GET  /api/demo/status  — public:    summarize the current session's demo
//                            state so the client can render the right banner.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import Compound from '../models/Compound.js';
import WeightLog from '../models/WeightLog.js';
import { requireAuth, requireAuthUser } from '../middleware/requireAuth.js';
import {
  getOrCreateSandbox,
  resetSandbox,
  findTemplate,
} from '../services/demo.js';
import { setDemoCookie, clearDemoCookie, readDemoCookie, verifyDemoToken } from '../lib/demoSession.js';
import { emitDemoEvent } from '../lib/demoEvents.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('demo-routes');

const skipInTest = () => process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e';

// 5/hour/IP — see PRD §7.6 (DB-DoS prevention via mass sandbox spawning).
const startLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'too_many_demo_starts' },
  handler: (req, res, _next, options) => {
    (req.log || log).warn({ ip: req.ip }, 'rate limit: demo start');
    res.status(options.statusCode).json(options.message);
  },
});

const router = Router();

// Internal: tries to identify any current demo session (anon or authed).
async function readSessionDemoState(req) {
  // Authed user with toggle on?
  const token = req.cookies?.token;
  if (token) {
    // We don't re-verify JWT here — requireAuth would have, but this endpoint
    // is public so we duplicate just enough to detect the toggle. If JWT is
    // bad we just ignore and check the demo cookie.
    try {
      const jwt = (await import('jsonwebtoken')).default;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.userId).lean();
      if (user && user.activeProfileId) {
        return { mode: 'authed', sandboxId: user.activeProfileId, authUserId: user._id };
      }
      if (user) {
        return { mode: 'authed', sandboxId: null, authUserId: user._id };
      }
    } catch {
      // fall through
    }
  }

  // Anon demo cookie?
  const demoToken = readDemoCookie(req);
  const sandboxId = verifyDemoToken(demoToken);
  if (sandboxId) {
    const sandbox = await User.findById(sandboxId).lean();
    if (sandbox?.isDemoSandbox) {
      return { mode: 'anon', sandboxId, authUserId: null };
    }
  }

  return { mode: 'none', sandboxId: null, authUserId: null };
}

// POST /api/demo/start  (anonymous)
// Creates a fresh anonymous sandbox and sets the demo cookie. If the caller
// already has a JWT (real user), they should use /enter instead — we don't
// want to mint orphaned anonymous sandboxes for already-authed sessions.
router.post('/start', startLimiter, async (req, res) => {
  // Reject only when there's a *valid* JWT for a real user — a stale/invalid
  // token cookie shouldn't block a returning visitor from starting an anon
  // demo.
  const session = await readSessionDemoState(req);
  if (session.mode === 'authed') {
    return res.status(400).json({ error: 'already_authenticated', hint: 'use /api/demo/enter' });
  }

  // If the visitor already has a live demo cookie, reuse the existing
  // sandbox instead of cloning a fresh one. Saves ~2-3s on refresh /
  // back-button / re-click — the only cost of the cold-clone is paid once
  // per browser per cleanup window (24h).
  const existingId = verifyDemoToken(readDemoCookie(req));
  if (existingId) {
    const existing = await User.findById(existingId);
    if (existing && existing.isDemoSandbox) {
      existing.lastActiveAt = new Date();
      await existing.save();
      return res.json({ sandboxId: String(existing._id), mode: 'anon', reused: true });
    }
  }

  try {
    const { sandbox, fromPool } = await getOrCreateSandbox({ authUserId: null });
    setDemoCookie(res, sandbox._id);
    emitDemoEvent(req, 'demo_start', { sandboxId: sandbox._id, fromPool: Boolean(fromPool) });
    res.status(201).json({
      sandboxId: String(sandbox._id),
      mode: 'anon',
      fromPool: Boolean(fromPool),
    });
  } catch (err) {
    (req.log || log).error(errContext(err), 'demo: start failed');
    res.status(500).json({ error: 'demo_start_failed' });
  }
});

// POST /api/demo/enter  (authed)
// Switches the real user's active profile to a parented sandbox. Reuses the
// existing sandbox if present so prior experiments are intact.
router.post('/enter', requireAuth, requireAuthUser, async (req, res) => {
  try {
    const { sandbox, created } = await getOrCreateSandbox({ authUserId: req.authUserId });
    await User.updateOne({ _id: req.authUserId }, { $set: { activeProfileId: sandbox._id } });
    emitDemoEvent(req, 'demo_enter', { sandboxId: sandbox._id, created });
    res.json({ sandboxId: String(sandbox._id), mode: 'authed', created });
  } catch (err) {
    (req.log || log).error(errContext(err), 'demo: enter failed');
    res.status(500).json({ error: 'demo_enter_failed' });
  }
});

// POST /api/demo/exit  (authed)
router.post('/exit', requireAuth, requireAuthUser, async (req, res) => {
  await User.updateOne({ _id: req.authUserId }, { $set: { activeProfileId: null } });
  emitDemoEvent(req, 'demo_exit');
  res.json({ ok: true });
});

// POST /api/demo/reset  (authed)
// Nukes the user's sandbox and re-clones from the current template. Used
// when Jeff has updated the canonical data and the user wants the new
// version. PRD §6.2 leans toward a confirm modal on the client.
router.post('/reset', requireAuth, requireAuthUser, async (req, res) => {
  const me = await User.findById(req.authUserId).lean();
  const sandboxId = me?.activeProfileId
    || (await User.findOne({ parentUserId: req.authUserId, isDemoSandbox: true }))?._id;
  if (!sandboxId) {
    return res.status(404).json({ error: 'no_sandbox' });
  }
  try {
    await resetSandbox(sandboxId);
    emitDemoEvent(req, 'demo_reset', { sandboxId });
    res.json({ ok: true, sandboxId: String(sandboxId) });
  } catch (err) {
    (req.log || log).error(errContext(err), 'demo: reset failed');
    res.status(500).json({ error: 'demo_reset_failed' });
  }
});

// Template metadata (compound list + day count) only changes when Jeff
// re-seeds. Cache in-process with a short TTL so /status — hit on every
// page load by the client router guard — is one cheap read most calls.
// Keyed on template id so a re-seed (new doc id) invalidates implicitly.
const TEMPLATE_META_TTL_MS = 5 * 60 * 1000;
let templateMetaCache = null; // { templateId, expiresAt, value }

async function getTemplateMeta(template) {
  const id = String(template._id);
  const now = Date.now();
  if (
    templateMetaCache
    && templateMetaCache.templateId === id
    && templateMetaCache.expiresAt > now
  ) {
    return templateMetaCache.value;
  }

  const [compounds, oldest, newest] = await Promise.all([
    Compound.find({ userId: template._id, isSystem: false, enabled: true })
      .select('name')
      .sort({ order: 1 })
      .lean(),
    WeightLog.findOne({ userId: template._id }).sort({ date: 1 }).select('date').lean(),
    WeightLog.findOne({ userId: template._id }).sort({ date: -1 }).select('date').lean(),
  ]);

  let dayCount = null;
  if (oldest && newest) {
    dayCount = Math.max(
      1,
      Math.round((newest.date.getTime() - oldest.date.getTime()) / 86400000),
    );
  }

  const value = {
    compoundNames: compounds.map((c) => c.name),
    dayCount,
    displayName: 'Jeff', // Founder's profile per PRD §5
  };
  templateMetaCache = { templateId: id, expiresAt: now + TEMPLATE_META_TTL_MS, value };
  return value;
}

// Exposed for tests / re-seed scripts that want immediate visibility.
export function invalidateTemplateMetaCache() {
  templateMetaCache = null;
}

// GET /api/demo/status  (public)
// Returns whatever demo state the current session is in. Drives the banner
// + the client's plan-aware UI: when in demo, the sandbox's plan ('unlimited')
// is what feature-gating reads, so every paid feature is visible.
router.get('/status', async (req, res) => {
  const [state, template] = await Promise.all([
    readSessionDemoState(req),
    findTemplate(),
  ]);

  let activePlanId = null;
  if (state.sandboxId) {
    const sandbox = await User.findById(state.sandboxId).select('plan').lean();
    activePlanId = sandbox?.plan || null;
  }

  const templateMeta = template ? await getTemplateMeta(template) : null;

  res.json({
    mode: state.mode, // 'none' | 'anon' | 'authed'
    sandboxId: state.sandboxId ? String(state.sandboxId) : null,
    isAnonymous: state.mode === 'anon',
    templateAvailable: Boolean(template),
    activePlanId,
    template: templateMeta,
  });
});

// POST /api/demo/clear-cookie  (public)
// Used by the client when an anonymous demo visitor finishes signup —
// the freshly-minted real account replaces the anon sandbox session.
router.post('/clear-cookie', (req, res) => {
  clearDemoCookie(res);
  res.json({ ok: true });
});

// POST /api/demo/event  (public beacon)
// Client-side instrumentation — fired when a demo visitor interacts with a
// "wow" feature (regression line, photo slider, etc.). Body: { feature: 'photo_slider' }.
// We trust the client name but cap length to keep cardinality sane.
router.post('/event', async (req, res) => {
  const feature = typeof req.body?.feature === 'string'
    ? req.body.feature.slice(0, 60)
    : null;
  if (!feature) return res.status(400).json({ error: 'feature_required' });
  const state = await readSessionDemoState(req);
  if (state.mode === 'none') return res.json({ ignored: true });
  emitDemoEvent(req, 'demo_feature_click', { feature, sandboxId: state.sandboxId });
  res.json({ ok: true });
});

export default router;
