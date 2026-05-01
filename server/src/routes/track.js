// Public funnel beacon. Hit by the client tracker (composables/useTracker.js)
// for page views, CTA clicks, and other client-side conversion signals.
//
// Design notes:
//   - Public route. We can't gate on auth because marketing pages have
//     no session; but we cap rate per IP and validate the event name
//     against an allowlist so this can't be abused as a write amplifier.
//   - Does not echo the request — the client uses navigator.sendBeacon
//     and ignores the response.
//   - Resolves the userId opportunistically: if there's a valid JWT
//     cookie we tag the event; otherwise userId stays null and the
//     anonId carries the identity until register-time stitching.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { CLIENT_EVENT_ALLOWLIST, insertFunnelEvent } from '../lib/funnelEvents.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('track');
const router = Router();

const skipInTest = () =>
  process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'e2e';

// Generous — a marketing page hits this once per nav + a CTA click. An
// abusive actor still has to come from real IPs to inflate the funnel.
const beaconLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: { error: 'too_many_track_calls' },
  handler: (req, res, _next, options) => {
    (req.log || log).warn({ ip: req.ip }, 'rate limit: track');
    res.status(options.statusCode).json(options.message);
  },
});

function resolveUserId(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.userId || null;
  } catch {
    return null;
  }
}

// POST /api/track  { name, props?, path?, referrer?, utm? }
router.post('/', beaconLimiter, async (req, res) => {
  // Synthetic / post-deploy smoke probes set this header so prod
  // FunnelEvent doesn't accumulate bot traffic. Ack with 204 so the
  // client tracker's keepalive logic stays happy; skip the insert.
  if (req.headers['x-synthetic-probe']) {
    return res.status(204).end();
  }

  // CSRF defense-in-depth. Default SameSite=lax already blocks cross-origin
  // cookies on POST, but if COOKIE_SAMESITE=none is configured (e.g. for
  // multi-subdomain deploys) that protection drops. Reject when the Origin
  // header is present and not from APP_URL — same-origin browser requests
  // omit the Origin or send our own host. Server-to-server calls have no
  // Origin and pass through.
  const origin = req.headers.origin;
  const expectedOrigin = process.env.APP_URL;
  if (origin && expectedOrigin && origin !== expectedOrigin) {
    log.warn({ origin, expectedOrigin }, 'track: rejected cross-origin beacon');
    return res.status(403).json({ error: 'forbidden_origin' });
  }

  const name = typeof req.body?.name === 'string' ? req.body.name : null;
  if (!name || !CLIENT_EVENT_ALLOWLIST.has(name)) {
    return res.status(400).json({ error: 'invalid_event' });
  }
  const props = req.body?.props && typeof req.body.props === 'object' ? req.body.props : {};
  const path = typeof req.body?.path === 'string' ? req.body.path : null;
  const referrer = typeof req.body?.referrer === 'string' ? req.body.referrer : null;
  const utm = req.body?.utm && typeof req.body.utm === 'object' ? req.body.utm : {};

  const userId = resolveUserId(req);
  insertFunnelEvent({
    name,
    anonId: req.anonId || null,
    userId,
    props,
    path,
    referrer,
    utmSource: utm.source || null,
    utmMedium: utm.medium || null,
    utmCampaign: utm.campaign || null,
    ua: req.headers['user-agent'] || null,
    ip: req.ip || null,
  });

  res.status(204).end();
});

export default router;
