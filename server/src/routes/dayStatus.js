import { Router } from 'express';
import DayStatus from '../models/DayStatus.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('dayStatus');
const router = Router();

const VALID_STATUS = ['tracked', 'untracked'];
const VALID_REASONS = ['forgot', 'partial', 'vacation', 'holiday', 'illness', 'fasted', 'other'];
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// `tracked` only allows reasons that mean "intentional inclusion".
// `untracked` only allows reasons that mean "exclude from rolling math".
// Anything else is normalized to 'other' to keep the schema honest.
const REASONS_BY_STATUS = {
  tracked: new Set(['fasted', 'other']),
  untracked: new Set(['forgot', 'partial', 'vacation', 'holiday', 'illness', 'other']),
};

function normalizeReason(status, reason) {
  if (!reason) return 'other';
  return REASONS_BY_STATUS[status]?.has(reason) ? reason : 'other';
}

// List rows in a date range. Sparse schema means most days have no row;
// the client fills in defaults via the auto-classification rule
// (see docs/tracked-untracked-days.md).
router.get('/', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to || !YMD_RE.test(from) || !YMD_RE.test(to)) {
    return res.status(400).json({ error: 'from and to (YYYY-MM-DD) required' });
  }
  const rows = await DayStatus.find({
    userId: req.userId,
    date: { $gte: from, $lte: to },
  }).sort({ date: 1 });
  res.json({ rows });
});

// Upsert a row. Idempotent — POST'ing the same date twice updates the
// existing row. Used by both the day-status menu (explicit user
// intent) and any future bulk-mark surfaces.
router.put('/', async (req, res) => {
  const rlog = req.log || log;
  const { date, status, reason, notes } = req.body || {};
  if (!date || !YMD_RE.test(date)) return res.status(400).json({ error: 'date (YYYY-MM-DD) required' });
  if (!VALID_STATUS.includes(status)) return res.status(400).json({ error: `status must be one of ${VALID_STATUS.join(', ')}` });
  const normalizedReason = normalizeReason(status, reason);

  try {
    const row = await DayStatus.findOneAndUpdate(
      { userId: req.userId, date },
      {
        $set: {
          status,
          reason: normalizedReason,
          notes: typeof notes === 'string' ? notes.slice(0, 200) : '',
        },
        $setOnInsert: { userId: req.userId, date },
      },
      { upsert: true, new: true, runValidators: true },
    );
    rlog.info({ date, status, reason: normalizedReason }, 'dayStatus: upsert');
    res.json({ row });
  } catch (err) {
    rlog.error({ ...errContext(err) }, 'dayStatus: upsert failed');
    res.status(500).json({ error: 'upsert failed' });
  }
});

// Remove an explicit row → revert to auto-classification for that day.
router.delete('/:date', async (req, res) => {
  const { date } = req.params;
  if (!YMD_RE.test(date)) return res.status(400).json({ error: 'date (YYYY-MM-DD) required' });
  const result = await DayStatus.deleteOne({ userId: req.userId, date });
  res.json({ ok: true, deleted: result.deletedCount });
});

export default router;
