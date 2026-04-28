// Demo mode endpoints.
//
//   POST /api/demo/start   — anonymous: mint a sandbox + set demo cookie.
//                            IP-rate-limited so a bot can't spawn thousands.
//   GET  /api/demo/status  — public:    summarize the current session's demo
//                            state so the client can render the right banner.
//
// Demo is pre-register only. Once a visitor authenticates (register or login),
// the demo is destroyed and unavailable until they log out and start a fresh
// one. Cleanup lives in routes/auth.js (clears demo cookie + deletes any
// parented sandbox + clears activeProfileId).

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import User from '../models/User.js';
import Compound from '../models/Compound.js';
import WeightLog from '../models/WeightLog.js';
import { getOrCreateSandbox, findTemplate } from '../services/demo.js';
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

// Internal: identify the current session's demo state.
//
// Authed users always read mode='authed' / sandboxId=null — demo is
// pre-register only, so an authed JWT and a demo session are mutually
// exclusive. The `activeProfileId` toggle field is no longer set by any
// route, but we read it defensively in case a grandfathered record exists
// (the next login() call clears it).
async function readSessionDemoState(req) {
  const token = req.cookies?.token;
  if (token) {
    try {
      const jwt = (await import('jsonwebtoken')).default;
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.userId).lean();
      if (user) {
        return { mode: 'authed', sandboxId: null, authUserId: user._id };
      }
    } catch {
      // fall through to anon-cookie check
    }
  }

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

// POST /api/demo/start  (anonymous only)
// Creates a fresh anonymous sandbox and sets the demo cookie. Authed users
// can't start a demo — they must log out first (demo is pre-register only).
router.post('/start', startLimiter, async (req, res) => {
  // Reject only when there's a *valid* JWT for a real user — a stale/invalid
  // token cookie shouldn't block a returning visitor from starting an anon
  // demo.
  const session = await readSessionDemoState(req);
  if (session.mode === 'authed') {
    return res.status(400).json({ error: 'already_authenticated', hint: 'log out to start a demo' });
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
