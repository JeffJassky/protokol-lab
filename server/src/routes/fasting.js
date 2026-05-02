import { Router } from 'express';
import FastingEvent from '../models/FastingEvent.js';
import UserSettings from '../models/UserSettings.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('fasting');
const router = Router();

// "Open or upcoming" feed — what the banner needs to render.
//   - the active fast (actualStartAt set, actualEndAt null) if any
//   - upcoming one-offs whose plannedStartAt is within the next 14 days
//   - recent completed events for history (last 14 days)
//
// The banner mostly cares about the first two; history is included so the
// settings page's recent-fasts list doesn't need a second round-trip.
router.get('/', async (req, res) => {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const events = await FastingEvent.find({
    userId: req.userId,
    $or: [
      { actualStartAt: { $ne: null }, actualEndAt: null },
      { plannedStartAt: { $gte: now, $lte: horizon } },
      { actualEndAt: { $gte: past } },
    ],
  })
    .sort({ plannedStartAt: 1 })
    .limit(50);

  (req.log || log).debug({ count: events.length }, 'fasting: feed fetched');
  res.json({ events });
});

// Start a manual fast (no planned schedule). Defaults the planned end to
// the user's current settings.fasting.fastDurationMinutes if available, so
// the goal line works for users who tap Start outside their normal window.
router.post('/start', async (req, res) => {
  const settings = await UserSettings.findOne({ userId: req.userId });
  const durationMin = req.body?.durationMinutes
    ? Math.max(15, Math.min(72 * 60, Math.round(Number(req.body.durationMinutes))))
    : (settings?.fasting?.fastDurationMinutes || 16 * 60);

  const now = new Date();
  const plannedEnd = new Date(now.getTime() + durationMin * 60 * 1000);

  // Reject if there's already an active fast — the banner only knows how to
  // render one. The client should call /end first.
  const existing = await FastingEvent.findOne({
    userId: req.userId,
    actualStartAt: { $ne: null },
    actualEndAt: null,
  });
  if (existing) {
    return res.status(409).json({ error: 'fast_already_active', event: existing });
  }

  const event = await FastingEvent.create({
    userId: req.userId,
    source: 'manual_start',
    plannedStartAt: now,
    plannedEndAt: plannedEnd,
    actualStartAt: now,
    actualEndAt: null,
  });
  (req.log || log).info({ eventId: String(event._id), durationMin }, 'fasting: manual start');
  res.status(201).json({ event });
});

// End the currently active fast.
router.post('/end', async (req, res) => {
  const event = await FastingEvent.findOne({
    userId: req.userId,
    actualStartAt: { $ne: null },
    actualEndAt: null,
  });
  if (!event) return res.status(404).json({ error: 'no_active_fast' });
  event.actualEndAt = new Date();
  await event.save();
  (req.log || log).info({ eventId: String(event._id) }, 'fasting: ended');
  res.json({ event });
});

// Create a one-off scheduled fast. Used for extended fasts or non-recurring
// occurrences. plannedStartAt must be in the future; plannedEndAt strictly after.
router.post('/one-off', async (req, res) => {
  const { plannedStartAt, plannedEndAt, notes } = req.body || {};
  const startAt = new Date(plannedStartAt);
  const endAt = new Date(plannedEndAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return res.status(400).json({ error: 'invalid_dates' });
  }
  if (endAt <= startAt) {
    return res.status(400).json({ error: 'end_before_start' });
  }
  const event = await FastingEvent.create({
    userId: req.userId,
    source: 'one_off',
    plannedStartAt: startAt,
    plannedEndAt: endAt,
    notes: typeof notes === 'string' ? notes.slice(0, 500) : '',
  });
  (req.log || log).info(
    { eventId: String(event._id), plannedStartAt: startAt, plannedEndAt: endAt },
    'fasting: one-off created',
  );
  res.status(201).json({ event });
});

// Edit any time field on an event (retroactive correction). Whitelisted set:
// plannedStartAt, plannedEndAt, actualStartAt, actualEndAt, notes.
router.patch('/:id', async (req, res) => {
  const event = await FastingEvent.findOne({ _id: req.params.id, userId: req.userId });
  if (!event) return res.status(404).json({ error: 'not_found' });

  const fields = ['plannedStartAt', 'plannedEndAt', 'actualStartAt', 'actualEndAt'];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const v = req.body[f];
      if (v === null) {
        event[f] = null;
      } else {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ error: `invalid_${f}` });
        }
        event[f] = d;
      }
    }
  }
  if (typeof req.body.notes === 'string') {
    event.notes = req.body.notes.slice(0, 500);
  }
  // Sanity: if both planned ends are present, end must be after start.
  if (event.plannedEndAt && event.plannedStartAt && event.plannedEndAt <= event.plannedStartAt) {
    return res.status(400).json({ error: 'end_before_start' });
  }
  await event.save();
  (req.log || log).info({ eventId: String(event._id) }, 'fasting: edited');
  res.json({ event });
});

router.delete('/:id', async (req, res) => {
  const event = await FastingEvent.findOneAndDelete({
    _id: req.params.id,
    userId: req.userId,
  });
  if (!event) return res.status(404).json({ error: 'not_found' });
  (req.log || log).info({ eventId: String(event._id) }, 'fasting: deleted');
  res.json({ ok: true });
});

export default router;
