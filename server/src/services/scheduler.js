import { Agenda } from 'agenda';
import { MongoBackend } from '@agendajs/mongo-backend';
import mongoose from 'mongoose';
import Compound from '../models/Compound.js';
import User from '../models/User.js';
import UserSettings from '../models/UserSettings.js';
import WeightLog from '../models/WeightLog.js';
import FoodLog from '../models/FoodLog.js';
import SymptomLog from '../models/SymptomLog.js';
import DoseLog from '../models/DoseLog.js';
import { sendToUser } from './push.js';
import { deleteSandbox, refillPool } from './demo.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('scheduler');

const MINUTE = 60 * 1000;

let agenda = null;

function formatInZone(date, timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = fmt.formatToParts(date);
    let hh = '00';
    let mm = '00';
    for (const p of parts) {
      if (p.type === 'hour') hh = p.value === '24' ? '00' : p.value.padStart(2, '0');
      if (p.type === 'minute') mm = p.value.padStart(2, '0');
    }
    return { hhmm: `${hh}:${mm}` };
  } catch (err) {
    log.warn({ ...errContext(err), timeZone }, 'formatInZone: invalid timezone, defaulting to 00:00');
    return { hhmm: '00:00' };
  }
}

function localDayKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function daysBetweenDayKeys(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function dayBoundsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  const startLocal = new Date(Date.UTC(y, m - 1, d));
  const targetKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} 00:00`;
  for (let i = -14; i <= 14; i++) {
    const cand = new Date(startLocal.getTime() + i * 60 * MINUTE);
    const sample = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(cand);
    const sy = sample.find((p) => p.type === 'year').value;
    const sm = sample.find((p) => p.type === 'month').value;
    const sd = sample.find((p) => p.type === 'day').value;
    const sh = sample.find((p) => p.type === 'hour').value;
    const sMin = sample.find((p) => p.type === 'minute').value;
    const key = `${sy}-${sm}-${sd} ${sh === '24' ? '00' : sh.padStart(2, '0')}:${sMin.padStart(2, '0')}`;
    if (key === targetKey) {
      return { start: cand, end: new Date(cand.getTime() + 24 * 60 * MINUTE) };
    }
  }
  return { start: startLocal, end: new Date(startLocal.getTime() + 24 * 60 * MINUTE) };
}

async function userLoggedToday(userId, start, end) {
  const q = { userId, date: { $gte: start, $lt: end } };
  const [w, f, s, d] = await Promise.all([
    WeightLog.exists(q),
    FoodLog.exists(q),
    SymptomLog.exists(q),
    DoseLog.exists(q),
  ]);
  return Boolean(w || f || s || d);
}

async function runTick() {
  const now = new Date();
  now.setSeconds(0, 0);
  const tickT0 = Date.now();

  const users = await UserSettings.find({
    $or: [
      { 'trackReminder.enabled': true },
    ],
  }).select('userId timezone trackReminder').lean();

  const compoundReminders = await Compound.find({
    reminderEnabled: true,
    enabled: true,
  }).lean();
  const userIdsWithCompoundReminders = new Set(compoundReminders.map((c) => String(c.userId)));

  const settingsByUser = new Map(users.map((u) => [String(u.userId), u]));
  for (const uid of userIdsWithCompoundReminders) {
    if (!settingsByUser.has(uid)) {
      const s = await UserSettings.findOne({ userId: uid }).select('userId timezone trackReminder').lean();
      if (s) settingsByUser.set(uid, s);
    }
  }

  const compoundsByUser = new Map();
  for (const c of compoundReminders) {
    const key = String(c.userId);
    if (!compoundsByUser.has(key)) compoundsByUser.set(key, []);
    compoundsByUser.get(key).push(c);
  }

  let doseFired = 0;
  let trackFired = 0;
  let trackSkippedLogged = 0;

  for (const [uid, settings] of settingsByUser) {
    const tz = settings.timezone || 'UTC';
    const { hhmm } = formatInZone(now, tz);
    const todayKey = localDayKey(now, tz);

    const compounds = compoundsByUser.get(uid) || [];
    for (const c of compounds) {
      if (!c.reminderTime || c.reminderTime !== hhmm) continue;
      const interval = Number(c.intervalDays) || 0;
      if (!interval) continue;

      const last = await DoseLog.findOne({ userId: uid, compoundId: c._id })
        .sort({ date: -1 })
        .select('date')
        .lean();
      if (last) {
        const lastKey = localDayKey(last.date, tz);
        if (lastKey === todayKey) {
          log.debug({ userId: uid, compound: c.name }, 'scheduler: dose already logged today');
          continue;
        }
        const required = Math.max(1, Math.ceil(interval));
        if (daysBetweenDayKeys(lastKey, todayKey) < required) {
          log.debug(
            { userId: uid, compound: c.name, daysSince: daysBetweenDayKeys(lastKey, todayKey), required },
            'scheduler: not yet due',
          );
          continue;
        }
      }

      const minuteKey = `${now.toISOString().slice(0, 16)}`;
      log.info(
        { userId: uid, compound: c.name, compoundId: String(c._id), tz, hhmm },
        'scheduler: firing dose reminder',
      );
      const result = await sendToUser(uid, 'doseReminder', {
        title: `Time for ${c.name}`,
        body: 'Tap to log your dose.',
        url: '/',
        category: 'doseReminder',
        tag: `dose:${c._id}:${minuteKey}`,
        data: { compoundId: String(c._id) },
      });
      log.info({ userId: uid, compound: c.name, ...result }, 'scheduler: dose reminder fanout');
      doseFired++;
    }

    if (settings.trackReminder?.enabled && settings.trackReminder.time === hhmm) {
      const { start, end } = dayBoundsInZone(now, tz);
      const logged = await userLoggedToday(uid, start, end);
      if (!logged) {
        const minuteKey = `${now.toISOString().slice(0, 16)}`;
        log.info({ userId: uid, tz, hhmm }, 'scheduler: firing track reminder');
        const result = await sendToUser(uid, 'trackReminder', {
          title: "Don't forget to log today",
          body: 'Weight, meals, symptoms — a quick tap keeps the trend honest.',
          url: '/',
          category: 'trackReminder',
          tag: `track:${minuteKey}`,
        });
        log.info({ userId: uid, ...result }, 'scheduler: track reminder fanout');
        trackFired++;
      } else {
        log.debug({ userId: uid, tz, hhmm }, 'scheduler: track reminder skipped (already logged)');
        trackSkippedLogged++;
      }
    }
  }

  log.debug(
    {
      users: settingsByUser.size,
      compoundReminders: compoundReminders.length,
      doseFired,
      trackFired,
      trackSkippedLogged,
      durationMs: Date.now() - tickT0,
    },
    'scheduler: tick complete',
  );
}

// PRD §7.4: anon sandboxes idle 24h get nuked, authed sandboxes idle 30d.
// Template (`isDemoTemplate=true`) is never touched.
const ANON_SANDBOX_TTL_MS = 24 * 60 * 60 * 1000;
const AUTHED_SANDBOX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function runDemoCleanup() {
  const now = Date.now();
  const anonCutoff = new Date(now - ANON_SANDBOX_TTL_MS);
  const authedCutoff = new Date(now - AUTHED_SANDBOX_TTL_MS);

  const candidates = await User.find({
    isDemoSandbox: true,
    // Pooled sandboxes are managed by the refill job, not the cleanup job.
    isPooled: { $ne: true },
    $or: [
      { parentUserId: null, lastActiveAt: { $lt: anonCutoff } },
      { parentUserId: { $ne: null }, lastActiveAt: { $lt: authedCutoff } },
      // Sandboxes never seen at all (createdAt-only, lastActiveAt null) older
      // than the anon TTL — treat them as anon and reap. Constrain to anon
      // (parentUserId null) so an authed sandbox with a missing stamp can't
      // be reaped at the wrong TTL.
      { parentUserId: null, lastActiveAt: null, createdAt: { $lt: anonCutoff } },
    ],
  })
    .select('_id parentUserId lastActiveAt')
    .lean();

  let anonDeleted = 0;
  let authedDeleted = 0;
  for (const sb of candidates) {
    try {
      // Clear the parent's pointer FIRST. If deletion ran before the
      // updateOne and we crashed in between, the user would wake up with a
      // dangling activeProfileId pointing at a tombstone — requireAuth
      // would scope their requests to it and every data route would
      // silently return empty.
      if (sb.parentUserId) {
        await User.updateOne(
          { _id: sb.parentUserId, activeProfileId: sb._id },
          { $set: { activeProfileId: null } },
        );
      }
      await deleteSandbox(sb._id);
      if (sb.parentUserId) authedDeleted++;
      else anonDeleted++;
    } catch (err) {
      log.error({ ...errContext(err), sandboxId: String(sb._id) }, 'demo-cleanup: delete failed');
    }
  }
  log.info({ anonDeleted, authedDeleted, total: candidates.length }, 'demo-cleanup: complete');
  return { anonDeleted, authedDeleted };
}

export async function startScheduler() {
  if (agenda) {
    log.debug('scheduler: already started');
    return agenda;
  }
  if (mongoose.connection.readyState !== 1) {
    log.warn({ readyState: mongoose.connection.readyState }, 'scheduler: mongoose not connected, deferring');
    return null;
  }

  agenda = new Agenda({
    backend: new MongoBackend({ mongo: mongoose.connection.db }),
    processEvery: 30 * 1000,
    defaultLockLifetime: 60 * 1000,
  });

  agenda.define(
    'reminder-tick',
    async () => {
      try {
        await runTick();
      } catch (err) {
        log.error(errContext(err), 'scheduler: tick failed');
      }
    },
    { lockLifetime: 60 * 1000 },
  );

  agenda.define(
    'demo-cleanup',
    async () => {
      try {
        await runDemoCleanup();
      } catch (err) {
        log.error(errContext(err), 'demo-cleanup: failed');
      }
    },
    { lockLifetime: 5 * 60 * 1000 },
  );

  // Warm-pool refill — keeps a few pre-cloned anon sandboxes ready so cold
  // visitors get the demo instantly instead of paying the clone latency.
  // Runs every minute; each tick builds at most (target - current) sandboxes.
  agenda.define(
    'demo-pool-refill',
    async () => {
      try {
        await refillPool();
      } catch (err) {
        log.error(errContext(err), 'demo-pool-refill: failed');
      }
    },
    { lockLifetime: 5 * 60 * 1000 },
  );

  agenda.on('fail', (err, job) => {
    log.error({ ...errContext(err), jobName: job?.attrs?.name }, 'scheduler: agenda job fail');
  });

  await agenda.start();
  await agenda.every('1 minute', 'reminder-tick');
  await agenda.every('1 minute', 'demo-pool-refill');
  // Nightly at 03:17 UTC — off the top of the hour to avoid colliding with
  // any cron stampedes elsewhere in infra.
  await agenda.every('17 3 * * *', 'demo-cleanup');
  log.info({ processEveryMs: 30000 }, 'scheduler: started');
  return agenda;
}

export async function stopScheduler() {
  if (!agenda) return;
  log.info('scheduler: stopping');
  await agenda.stop();
  agenda = null;
  log.info('scheduler: stopped');
}
