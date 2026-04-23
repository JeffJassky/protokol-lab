import { Router } from "express";
import PushSubscription from "../models/PushSubscription.js";
import {
  getVapidPublicKey,
  isPushConfigured,
  sendToSubscription,
} from "../services/push.js";

// Public router — mounted without requireAuth so the client can fetch the
// VAPID key before it has authenticated (or to preload).
export const publicPushRouter = Router();

publicPushRouter.get("/vapid-public-key", (req, res) => {
  res.json({ key: getVapidPublicKey(), enabled: isPushConfigured() });
});

// Authenticated router — mounted under requireAuth.
const router = Router();

router.post("/subscribe", async (req, res) => {
  const { subscription, categories } = req.body || {};
  if (
    !subscription?.endpoint ||
    !subscription?.keys?.p256dh ||
    !subscription?.keys?.auth
  ) {
    return res.status(400).json({ error: "Invalid subscription" });
  }

  const filter = { userId: req.userId, endpoint: subscription.endpoint };
  const update = {
    userId: req.userId,
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    userAgent: req.headers["user-agent"] || "",
  };
  if (categories && typeof categories === "object") {
    update.categories = {
      doseReminder: categories.doseReminder !== false,
      trackReminder: categories.trackReminder !== false,
      test: categories.test !== false,
    };
  }

  const sub = await PushSubscription.findOneAndUpdate(filter, update, {
    upsert: true,
    returnDocument: "after",
    setDefaultsOnInsert: true,
  });

  res.status(201).json({ subscription: sub });
});

router.post("/unsubscribe", async (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  await PushSubscription.deleteOne({ userId: req.userId, endpoint });
  res.status(204).send();
});

// pushsubscriptionchange — the browser rotated our subscription. Swap rows.
router.post("/refresh", async (req, res) => {
  const { subscription, oldEndpoint } = req.body || {};
  if (!subscription?.endpoint)
    return res.status(400).json({ error: "subscription required" });

  if (oldEndpoint) {
    await PushSubscription.deleteOne({
      userId: req.userId,
      endpoint: oldEndpoint,
    });
  }
  const sub = await PushSubscription.findOneAndUpdate(
    { userId: req.userId, endpoint: subscription.endpoint },
    {
      userId: req.userId,
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      userAgent: req.headers["user-agent"] || "",
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  res.json({ subscription: sub });
});

router.patch("/categories", async (req, res) => {
  const { endpoint, categories } = req.body || {};
  if (!endpoint || !categories)
    return res.status(400).json({ error: "endpoint + categories required" });

  const update = {};
  if (categories.doseReminder !== undefined)
    update["categories.doseReminder"] = Boolean(categories.doseReminder);
  if (categories.trackReminder !== undefined)
    update["categories.trackReminder"] = Boolean(categories.trackReminder);
  if (categories.test !== undefined)
    update["categories.test"] = Boolean(categories.test);

  const sub = await PushSubscription.findOneAndUpdate(
    { userId: req.userId, endpoint },
    { $set: update },
    { returnDocument: "after" },
  );
  if (!sub) return res.status(404).json({ error: "Not found" });
  res.json({ subscription: sub });
});

router.get("/subscriptions", async (req, res) => {
  const subs = await PushSubscription.find({ userId: req.userId }).select(
    "-__v",
  );
  res.json({ subscriptions: subs });
});

router.post("/test", async (req, res) => {
  const { endpoint } = req.body || {};
  const query = { userId: req.userId };
  if (endpoint) query.endpoint = endpoint;
  const subs = await PushSubscription.find(query);
  console.log("[push] /test hit — subs matched:", subs.length, "for user:", String(req.userId));
  if (!subs.length) return res.status(404).json({ error: "No subscriptions" });

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
  console.log("[push] /test results:", results.map((r) => ({ ok: r.ok, reason: r.reason })));
  res.json({ results: results.map((r) => ({ ok: r.ok, reason: r.reason })) });
});

export default router;
