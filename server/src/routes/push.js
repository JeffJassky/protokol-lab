import { Router } from "express";
import PushSubscription from "../models/PushSubscription.js";
import {
  getVapidPublicKey,
  isPushConfigured,
  sendToSubscription,
} from "../services/push.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger('push');

export const publicPushRouter = Router();

publicPushRouter.get("/vapid-public-key", (req, res) => {
  res.json({ key: getVapidPublicKey(), enabled: isPushConfigured() });
});

const router = Router();

// Accepts three transport variants:
//   web : { subscription: { endpoint, keys: { p256dh, auth } } }
//   fcm : { transport: 'fcm', token: '<device token>' }
//   apns: { transport: 'apns', token: '<device token>' }
// Phase A wires fcm + apns through the schema; the actual send paths land
// when M7 ships its Firebase + APNs credentials. Until then native sub
// rows are stored but the cron worker skips them gracefully.
router.post("/subscribe", async (req, res) => {
  const rlog = req.log || log;
  const { subscription, categories, transport, token } = req.body || {};

  let filter;
  let update;

  if (transport === 'fcm' || transport === 'apns') {
    if (typeof token !== 'string' || !token) {
      rlog.warn({ transport }, 'push subscribe: native token missing');
      return res.status(400).json({ error: "Invalid native token" });
    }
    // Synthesize a stable endpoint string from `${transport}:${token}` so
    // the existing (userId, endpoint) unique index dedupes native subs
    // without changing the index shape.
    const endpoint = `${transport}:${token}`;
    filter = { userId: req.authUserId, endpoint };
    update = {
      userId: req.authUserId,
      transport,
      endpoint,
      token,
      userAgent: req.headers["user-agent"] || "",
    };
  } else {
    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      rlog.warn('push subscribe: invalid subscription body');
      return res.status(400).json({ error: "Invalid subscription" });
    }
    filter = { userId: req.authUserId, endpoint: subscription.endpoint };
    update = {
      userId: req.authUserId,
      transport: 'web',
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      userAgent: req.headers["user-agent"] || "",
    };
  }

  if (categories && typeof categories === "object") {
    update.categories = {
      doseReminder: categories.doseReminder !== false,
      trackReminder: categories.trackReminder !== false,
      menstruationReminder: categories.menstruationReminder !== false,
      fastingReminder: categories.fastingReminder !== false,
      test: categories.test !== false,
    };
  }

  const sub = await PushSubscription.findOneAndUpdate(filter, update, {
    upsert: true,
    returnDocument: "after",
    setDefaultsOnInsert: true,
  });

  rlog.info(
    {
      subscriptionId: String(sub._id),
      transport: sub.transport,
      endpointHost: sub.transport === 'web' ? new URL(sub.endpoint).host : sub.transport,
      categories: update.categories,
    },
    'push: subscription upserted',
  );
  res.status(201).json({ subscription: sub });
});

router.post("/unsubscribe", async (req, res) => {
  const rlog = req.log || log;
  const { endpoint } = req.body || {};
  if (!endpoint) {
    rlog.warn('push unsubscribe: missing endpoint');
    return res.status(400).json({ error: "endpoint required" });
  }
  const { deletedCount } = await PushSubscription.deleteOne({ userId: req.authUserId, endpoint });
  rlog.info({ deletedCount }, 'push: unsubscribed');
  res.status(204).send();
});

router.post("/refresh", async (req, res) => {
  const rlog = req.log || log;
  const { subscription, oldEndpoint } = req.body || {};
  if (!subscription?.endpoint) {
    rlog.warn('push refresh: missing subscription');
    return res.status(400).json({ error: "subscription required" });
  }

  if (oldEndpoint) {
    await PushSubscription.deleteOne({
      userId: req.authUserId,
      endpoint: oldEndpoint,
    });
  }
  const sub = await PushSubscription.findOneAndUpdate(
    { userId: req.authUserId, endpoint: subscription.endpoint },
    {
      userId: req.authUserId,
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      userAgent: req.headers["user-agent"] || "",
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  rlog.info(
    { subscriptionId: String(sub._id), replacedOld: Boolean(oldEndpoint) },
    'push: subscription refreshed',
  );
  res.json({ subscription: sub });
});

router.patch("/categories", async (req, res) => {
  const rlog = req.log || log;
  const { endpoint, categories } = req.body || {};
  if (!endpoint || !categories) {
    rlog.warn('push categories: missing endpoint or categories');
    return res.status(400).json({ error: "endpoint + categories required" });
  }

  const update = {};
  if (categories.doseReminder !== undefined)
    update["categories.doseReminder"] = Boolean(categories.doseReminder);
  if (categories.trackReminder !== undefined)
    update["categories.trackReminder"] = Boolean(categories.trackReminder);
  if (categories.menstruationReminder !== undefined)
    update["categories.menstruationReminder"] = Boolean(categories.menstruationReminder);
  if (categories.fastingReminder !== undefined)
    update["categories.fastingReminder"] = Boolean(categories.fastingReminder);
  if (categories.test !== undefined)
    update["categories.test"] = Boolean(categories.test);

  const sub = await PushSubscription.findOneAndUpdate(
    { userId: req.authUserId, endpoint },
    { $set: update },
    { returnDocument: "after" },
  );
  if (!sub) {
    rlog.warn({ endpoint }, 'push categories: subscription not found');
    return res.status(404).json({ error: "Not found" });
  }
  rlog.info({ subscriptionId: String(sub._id), changed: Object.keys(update) }, 'push: categories updated');
  res.json({ subscription: sub });
});

router.get("/subscriptions", async (req, res) => {
  const subs = await PushSubscription.find({ userId: req.authUserId }).select("-__v");
  (req.log || log).debug({ count: subs.length }, 'push: subscriptions listed');
  res.json({ subscriptions: subs });
});

router.post("/test", async (req, res) => {
  const rlog = req.log || log;
  const { endpoint } = req.body || {};
  const query = { userId: req.authUserId };
  if (endpoint) query.endpoint = endpoint;
  const subs = await PushSubscription.find(query);
  rlog.info({ matched: subs.length, scoped: Boolean(endpoint) }, 'push test: sending');
  if (!subs.length) {
    rlog.warn('push test: no subscriptions matched');
    return res.status(404).json({ error: "No subscriptions" });
  }

  const payload = {
    title: "Protokol Lab",
    body: "Test notification — you're all set!",
    category: "test",
    url: "/",
    tag: "test",
  };
  const results = await Promise.all(
    subs.map((s) => sendToSubscription(s, payload)),
  );
  const sent = results.filter((r) => r.ok).length;
  const removed = results.filter((r) => r.removed).length;
  const failed = results.filter((r) => !r.ok && !r.removed).length;
  rlog.info({ total: results.length, sent, removed, failed }, 'push test: completed');
  res.json({ results: results.map((r) => ({ ok: r.ok, reason: r.reason })) });
});

export default router;
