// Test-only helper endpoints. Mounted ONLY when NODE_ENV === 'e2e' (see
// app.js). Every handler also checks the env at runtime as defense in
// depth — if this file ever gets accidentally mounted in any other env,
// the handlers refuse.
//
// These exist because Playwright tests need to set up DB state (seed the
// demo template, reset between specs) and the public API doesn't expose
// those operations for obvious reasons.

import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Compound from '../models/Compound.js';
import WeightLog from '../models/WeightLog.js';
import FoodItem from '../models/FoodItem.js';
import FoodLog from '../models/FoodLog.js';

const router = Router();

// Gate on BOTH NODE_ENV=e2e AND a shared-secret header. NODE_ENV alone is
// one misconfigured deploy away from exposing /reset (drops every collection)
// to the public internet. Requiring INTERNAL_TEST_TOKEN means a stray env var
// isn't sufficient — the token also has to leak. Playwright sets it via
// extraHTTPHeaders in playwright.config.js.
function ensureE2e(req, res, next) {
  if (process.env.NODE_ENV !== 'e2e') {
    return res.status(404).json({ error: 'not_found' });
  }
  const expected = process.env.INTERNAL_TEST_TOKEN;
  if (!expected || req.get('x-internal-test-token') !== expected) {
    return res.status(404).json({ error: 'not_found' });
  }
  next();
}

router.use(ensureE2e);

// POST /api/__test/seed-demo-template
// Idempotent: if a template already exists, returns it without rebuilding.
// Body: optional { compounds: ['Tirzepatide', ...], days: 30 }
router.post('/seed-demo-template', async (req, res) => {
  const compoundNames = req.body?.compounds || ['Tirzepatide'];
  const days = Number(req.body?.days) || 30;

  let tmpl = await User.findOne({ isDemoTemplate: true });
  if (!tmpl) {
    tmpl = await User.create({
      email: `tmpl-${Date.now()}@demo.local`,
      isDemoTemplate: true,
      displayName: 'Jeff',
    });
    for (const name of compoundNames) {
      await Compound.create({
        userId: tmpl._id,
        name,
        isSystem: false,
        enabled: true,
        halfLifeDays: 5,
        intervalDays: 7,
      });
    }
    const fi = await FoodItem.create({
      userId: tmpl._id,
      name: 'Eggs',
      caloriesPer: 80,
      isCustom: true,
    });
    await FoodLog.create({
      userId: tmpl._id,
      foodItemId: fi._id,
      date: new Date(),
      mealType: 'breakfast',
      servingCount: 2,
    });
    await WeightLog.create({
      userId: tmpl._id,
      weightLbs: 200,
      date: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    });
    await WeightLog.create({
      userId: tmpl._id,
      weightLbs: 185,
      date: new Date(),
    });
  }
  res.json({ ok: true, templateId: String(tmpl._id) });
});

// POST /api/__test/reset
// Drops every collection in the test DB. Use sparingly — most tests
// should rely on per-spec unique emails for isolation.
router.post('/reset', async (req, res) => {
  const collections = mongoose.connection.collections;
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }
  res.json({ ok: true });
});

export default router;
