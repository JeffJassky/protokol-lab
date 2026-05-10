#!/usr/bin/env node
//
// One-shot migration: spread each day's FoodLog timestamps across an
// 11am→9pm local window, in the order the entries were added.
//
// Why: backfilled food logs all stacked at the server-now hour (see
// the resolveLogTimestamp bug fixed in routes/foodlog.js). The
// resulting sim charts showed every meal as a single tower at one
// time-of-day; this script redistributes them so the sim sees plausible
// meal cadence and the charts reflect normal eating patterns.
//
// Strategy:
//   1. Pull every FoodLog row, joined with the user's tz from
//      UserSettings.timezone (IANA, e.g. "America/Los_Angeles").
//   2. Group by (userId, local-calendar-day).
//   3. Within each group, sort ASC by createdAt (= original log order).
//   4. Spread evenly across [11:00, 21:00) local time on that day.
//   5. Write the new `date` (full ISO) back. Idempotent only by data —
//      re-running shifts again. Use `--dry-run` first.
//
// Usage:
//   node src/scripts/redistribute-foodlog-times.js [--dry-run] [--user-id=<id>]
//
// Skips entries whose ISO time-of-day is already inside the spread
// window (assumes the user already gave them real times) unless
// `--force` is passed.

import 'dotenv/config';
import mongoose from 'mongoose';
import FoodLog from '../models/FoodLog.js';
import UserSettings from '../models/UserSettings.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('migrate-foodlog-times');

const SPREAD_START_HOUR = 11; // 11:00 local
const SPREAD_END_HOUR = 21;   // 21:00 local (exclusive endpoint for spread)

// Format `Date` → "YYYY-MM-DD" in the given IANA tz. Cheap and portable.
function localDayKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Build a Date that lands at HH:MM:00 LOCAL on the given YYYY-MM-DD in
// `timeZone`. We lean on the offset Intl reports for that instant.
//
// Algorithm: take a probe at `${ymd}T${hh}:${mm}:00Z` (treated as UTC),
// see what local hour the target tz formats it as, then shift by the
// difference. Two iterations suffice across DST boundaries.
function localDateTimeAt(ymd, hour, minute, timeZone) {
  let probeMs = Date.parse(
    `${ymd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );
  for (let i = 0; i < 2; i++) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = fmt.formatToParts(new Date(probeMs));
    const seenHour = Number(parts.find((p) => p.type === 'hour').value);
    const seenMin = Number(parts.find((p) => p.type === 'minute').value);
    const wantTotal = hour * 60 + minute;
    const seenTotal = seenHour * 60 + seenMin;
    const deltaMin = wantTotal - seenTotal;
    if (deltaMin === 0) break;
    probeMs += deltaMin * 60_000;
  }
  return new Date(probeMs);
}

function spreadHours(count) {
  if (count <= 0) return [];
  if (count === 1) return [(SPREAD_START_HOUR + SPREAD_END_HOUR) / 2];
  const span = SPREAD_END_HOUR - SPREAD_START_HOUR;
  const step = span / count;
  const out = [];
  for (let i = 0; i < count; i++) {
    // Center each entry within its slot — first entry gets step/2 in,
    // last gets step/2 from the end. Avoids piling up at the edges.
    out.push(SPREAD_START_HOUR + step * (i + 0.5));
  }
  return out;
}

export async function redistributeFoodLogTimes({
  dryRun = false,
  userId = null,
  force = false,
} = {}) {
  const userFilter = userId
    ? { _id: new mongoose.Types.ObjectId(userId) }
    : {};
  const users = await UserSettings.find(userFilter)
    .select('userId timezone')
    .lean();

  const stats = {
    usersScanned: 0,
    entriesScanned: 0,
    entriesUpdated: 0,
    entriesSkipped: 0,
    daysProcessed: 0,
  };

  for (const u of users) {
    stats.usersScanned += 1;
    const tz = u.timezone || 'UTC';
    const entries = await FoodLog.find({ userId: u.userId })
      .sort({ createdAt: 1 })
      .lean();
    if (!entries.length) continue;

    // Bucket by user-local day.
    const byDay = new Map();
    for (const e of entries) {
      stats.entriesScanned += 1;
      const dayKey = localDayKey(e.date, tz);
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey).push(e);
    }

    for (const [dayKey, dayEntries] of byDay) {
      stats.daysProcessed += 1;
      const targets = spreadHours(dayEntries.length);
      for (let i = 0; i < dayEntries.length; i++) {
        const entry = dayEntries[i];
        const targetHour = Math.floor(targets[i]);
        const targetMin = Math.round((targets[i] - targetHour) * 60);
        const newDate = localDateTimeAt(dayKey, targetHour, targetMin, tz);

        // Skip rows already inside the spread window unless --force.
        // Cheap protection against re-running and shifting things
        // further from where the user wants them.
        const existingHour = Number(
          new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour12: false,
            hour: '2-digit',
          }).format(entry.date),
        );
        if (
          !force
          && existingHour >= SPREAD_START_HOUR
          && existingHour < SPREAD_END_HOUR
          && Math.abs(entry.date.getTime() - newDate.getTime()) < 60 * 60_000
        ) {
          stats.entriesSkipped += 1;
          continue;
        }

        if (!dryRun) {
          await FoodLog.updateOne({ _id: entry._id }, { $set: { date: newDate } });
        }
        stats.entriesUpdated += 1;
      }
    }
  }

  log.info(stats, 'foodlog redistribute: complete');
  return stats;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    log.error('MONGODB_URI not set — aborting');
    process.exit(1);
  }
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');
  const userArg = process.argv.find((a) => a.startsWith('--user-id='));
  const userId = userArg ? userArg.split('=')[1] : null;

  try {
    await mongoose.connect(uri);
    const stats = await redistributeFoodLogTimes({ dryRun, force, userId });
    log.info(stats, 'CLI complete');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    log.error(errContext(err), 'CLI failed');
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}
