import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('push-svc');

let configured = false;

export function initPush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!pub || !priv) {
    throw new Error(
      'VAPID keys missing. Run `node src/scripts/generate-vapid.js` and add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to server/.env.',
    );
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  log.info({ subject, publicKeyPrefix: pub.slice(0, 16) + '…' }, 'push configured');
}

export function isPushConfigured() {
  return configured;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

function endpointHost(endpoint) {
  try { return new URL(endpoint).host; } catch { return '(invalid)'; }
}

export async function sendToSubscription(subDoc, payload) {
  if (!configured) {
    log.warn({ subscriptionId: String(subDoc._id) }, 'push send: not configured, skipping');
    return { ok: false, reason: 'not-configured' };
  }

  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const pushSub = {
    endpoint: subDoc.endpoint,
    keys: { p256dh: subDoc.keys.p256dh, auth: subDoc.keys.auth },
  };

  const host = endpointHost(subDoc.endpoint);
  const t0 = Date.now();
  try {
    await webpush.sendNotification(pushSub, body, { TTL: 3600 });
    log.info(
      {
        subscriptionId: String(subDoc._id),
        userId: String(subDoc.userId),
        host,
        bodyBytes: Buffer.byteLength(body),
        durationMs: Date.now() - t0,
        category: typeof payload === 'object' ? payload.category : undefined,
      },
      'push sent',
    );
    subDoc.lastSentAt = new Date();
    subDoc.lastError = null;
    await subDoc.save();
    return { ok: true };
  } catch (err) {
    const statusCode = err.statusCode;
    const ctx = {
      subscriptionId: String(subDoc._id),
      userId: String(subDoc.userId),
      host,
      statusCode,
      body: err.body,
      durationMs: Date.now() - t0,
    };

    if (statusCode === 404 || statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subDoc._id });
      log.info(ctx, 'push: expired subscription pruned');
      return { ok: false, reason: 'expired', removed: true };
    }

    log.error({ ...ctx, ...errContext(err) }, 'push send failed');
    subDoc.lastError = `${statusCode || 'err'}: ${err.body || err.message}`;
    await subDoc.save().catch(() => {});
    return { ok: false, reason: 'error', error: err };
  }
}

export async function sendToUser(userId, category, payload) {
  const query = { userId };
  if (category) query[`categories.${category}`] = { $ne: false };
  const subs = await PushSubscription.find(query);
  if (!subs.length) {
    log.debug({ userId: String(userId), category }, 'push fanout: no subs matched');
    return { sent: 0, removed: 0, failed: 0, total: 0 };
  }
  let sent = 0;
  let removed = 0;
  let failed = 0;
  await Promise.all(subs.map(async (s) => {
    const r = await sendToSubscription(s, payload);
    if (r.ok) sent++;
    else if (r.removed) removed++;
    else failed++;
  }));
  log.info(
    { userId: String(userId), category, total: subs.length, sent, removed, failed },
    'push fanout complete',
  );
  return { sent, removed, failed, total: subs.length };
}
