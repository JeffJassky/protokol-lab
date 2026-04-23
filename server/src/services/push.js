import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

let configured = false;

export function initPush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!pub || !priv) {
    console.warn('[push] VAPID keys missing — push disabled. Run `node src/scripts/generate-vapid.js`.');
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  console.log('[push] configured');
}

export function isPushConfigured() {
  return configured;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || '';
}

// Sends one notification to one subscription document. On 404/410, the
// subscription is dead — delete it so we stop paying to try again.
export async function sendToSubscription(subDoc, payload) {
  if (!configured) return { ok: false, reason: 'not-configured' };

  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const pushSub = {
    endpoint: subDoc.endpoint,
    keys: { p256dh: subDoc.keys.p256dh, auth: subDoc.keys.auth },
  };

  try {
    await webpush.sendNotification(pushSub, body, { TTL: 3600 });
    console.log('[push] sent to', subDoc.endpoint.slice(0, 60) + '…');
    subDoc.lastSentAt = new Date();
    subDoc.lastError = null;
    await subDoc.save();
    return { ok: true };
  } catch (err) {
    console.error(
      '[push] send failed',
      err.statusCode || '',
      err.body || err.message,
      'endpoint:', subDoc.endpoint.slice(0, 60) + '…',
    );
    if (err.statusCode === 404 || err.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subDoc._id });
      return { ok: false, reason: 'expired', removed: true };
    }
    subDoc.lastError = `${err.statusCode || 'err'}: ${err.body || err.message}`;
    await subDoc.save().catch(() => {});
    return { ok: false, reason: 'error', error: err };
  }
}

// Fan-out helper: sends to every subscription the user has, filtered by
// category. Returns counts for logging.
export async function sendToUser(userId, category, payload) {
  const query = { userId };
  if (category) query[`categories.${category}`] = { $ne: false };
  const subs = await PushSubscription.find(query);
  let sent = 0;
  let removed = 0;
  let failed = 0;
  await Promise.all(subs.map(async (s) => {
    const r = await sendToSubscription(s, payload);
    if (r.ok) sent++;
    else if (r.removed) removed++;
    else failed++;
  }));
  return { sent, removed, failed, total: subs.length };
}
