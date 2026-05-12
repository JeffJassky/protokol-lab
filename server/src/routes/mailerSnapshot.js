// Snapshot endpoint for Mailery webhook steps.
//
// Mailery flow templates (especially inactivity-rescue, trial-ending) want
// per-user dynamic data interpolated at send time — e.g. "your last dose
// was {{last_compound}} {{last_dose}}mg on {{last_dose_date}}". The
// `webhook` flow step fetches a URL and exposes the response JSON as
// template vars. This route is what those webhook steps call.
//
// Auth: shared secret in X-Mailer-Internal-Secret header. The secret is
// `MAILER_INTERNAL_SECRET` env var. NOT user-auth gated — Mailery is
// service-side, not browser-side. Without the header (or wrong secret),
// returns 401.
//
// Response shape is intentionally flat key/value, no nesting. Mailery's
// Handlebars renderer pulls top-level keys into the template scope.

import { Router } from 'express';
import mongoose from 'mongoose';
import DoseLog from '../models/DoseLog.js';
import WeightLog from '../models/WeightLog.js';
import SymptomLog from '../models/SymptomLog.js';
import Compound from '../models/Compound.js';
import { childLogger, errContext } from '../lib/logger.js';
import { PEPTIDE_CATALOG_INDEX } from '@kyneticbio/core';

const log = childLogger('mailer-snapshot');
const router = Router();

router.use((req, res, next) => {
  const expected = process.env.MAILER_INTERNAL_SECRET;
  if (!expected) {
    log.warn('MAILER_INTERNAL_SECRET not set — refusing all snapshot requests');
    return res.status(503).json({ error: 'snapshot_disabled' });
  }
  const got = req.headers['x-mailer-internal-secret'];
  if (got !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return next();
});

router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ error: 'invalid_user_id' });
  }
  const uid = new mongoose.Types.ObjectId(userId);

  try {
    const [lastDose, lastWeight, weightThirtyDaysAgo, recentSymptomCount] = await Promise.all([
      DoseLog.findOne({ userId: uid }).sort({ date: -1, _id: -1 }).lean(),
      WeightLog.findOne({ userId: uid }).sort({ date: -1, _id: -1 }).lean(),
      WeightLog.findOne({ userId: uid, date: { $lte: daysAgo(30) } }).sort({ date: -1, _id: -1 }).lean(),
      SymptomLog.countDocuments({ userId: uid, date: { $gte: daysAgo(30) } }),
    ]);

    let lastCompoundName = null;
    if (lastDose) {
      if (lastDose.coreInterventionKey) {
        const entry = PEPTIDE_CATALOG_INDEX.get(lastDose.coreInterventionKey);
        lastCompoundName = entry?.displayName || entry?.name || lastDose.coreInterventionKey;
      } else if (lastDose.compoundId) {
        const compound = await Compound.findOne({ _id: lastDose.compoundId, userId: uid }).lean();
        lastCompoundName = compound?.name || null;
      }
    }

    const weightDelta = (lastWeight && weightThirtyDaysAgo)
      ? Number((lastWeight.weightLbs - weightThirtyDaysAgo.weightLbs).toFixed(1))
      : null;

    res.json({
      last_compound: lastCompoundName,
      last_dose: lastDose?.value ?? null,
      last_dose_date: lastDose?.date ? lastDose.date.toISOString().slice(0, 10) : null,
      last_weight_lbs: lastWeight?.weightLbs ?? null,
      last_weight_date: lastWeight?.date ? lastWeight.date.toISOString().slice(0, 10) : null,
      weight_delta_30d_lbs: weightDelta,
      recent_symptom_count_30d: recentSymptomCount,
    });
  } catch (err) {
    log.error({ ...errContext(err), userId }, 'snapshot: lookup failed');
    res.status(500).json({ error: 'snapshot_failed' });
  }
});

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export default router;
