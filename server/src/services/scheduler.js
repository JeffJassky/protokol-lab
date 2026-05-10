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
import FastingEvent from '../models/FastingEvent.js';
import { computeFastingNotifications } from '../../../shared/logging/fasting.js';
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

function weekdayInZone(date, timeZone) {
  // 0 (Sun) – 6 (Sat) — matches Date#getDay() and the schedule's
  // weeklyRules.weekday convention.
  const SHORT = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
    const tag = fmt.format(date);
    return SHORT[tag] ?? date.getUTCDay();
  } catch {
    return date.getUTCDay();
  }
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
      { 'menstruation.enabled': true, 'menstruation.notifications.enabled': true },
      { 'fasting.enabled': true, 'fasting.notifications.enabled': true },
    ],
  }).select('userId timezone trackReminder menstruation fasting').lean();

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

    // Menstrual-cycle notifications. Predicted dates are derived from
    // lastPeriodStart + cycleLength + lutealPhaseLength; each enabled
    // event has its own offset (daysBefore for everything except late-
    // period which uses daysAfter). We only fire when both the predicted
    // event date matches today's local day key AND the user's chosen
    // notification time matches the current hhmm.
    const m = settings.menstruation;
    if (m?.enabled && m.notifications?.enabled && m.notifications.time === hhmm && m.lastPeriodStart) {
      const start = new Date(m.lastPeriodStart);
      if (!Number.isNaN(start.getTime())) {
        const cl = Math.max(15, Math.min(60, Number(m.cycleLength) || 28));
        const lp = Math.max(7, Math.min(20, Number(m.lutealPhaseLength) || 14));
        const ms = 86400000;
        // Roll forward to the first predicted-period date that's not in
        // the past relative to today's local midnight. Anchor everything
        // on UTC math — predictions are day-grained, so DST jitter is
        // <24h and harmless for "did today match the prediction" checks.
        const todayUtc = new Date(`${todayKey}T00:00:00.000Z`);
        let nextPeriod = new Date(start.getTime());
        while (nextPeriod < todayUtc) nextPeriod = new Date(nextPeriod.getTime() + cl * ms);
        // Backtrack one cycle so predictions for "few days before next
        // period" don't always land in the future when today is between
        // events. nextPeriod becomes the upcoming or just-passed period.
        if (nextPeriod.getTime() - todayUtc.getTime() > cl * ms / 2) {
          nextPeriod = new Date(nextPeriod.getTime() - cl * ms);
        }
        const ovulation = new Date(nextPeriod.getTime() - lp * ms);
        const fertileStart = new Date(ovulation.getTime() - 5 * ms);

        const dayKeyOf = (d) => localDayKey(d, tz);
        const offsetDayKey = (d, days) => dayKeyOf(new Date(d.getTime() + days * ms));

        const targets = [];
        const n = m.notifications;
        if (n.periodExpected?.enabled) {
          targets.push({
            event: 'periodExpected',
            day: offsetDayKey(nextPeriod, -(Number(n.periodExpected.daysBefore) || 0)),
            title: 'Period expected soon',
            body: `Your next period is predicted for ${nextPeriod.toLocaleDateString([], { month: 'short', day: 'numeric' })}.`,
          });
        }
        if (n.ovulationExpected?.enabled) {
          targets.push({
            event: 'ovulationExpected',
            day: offsetDayKey(ovulation, -(Number(n.ovulationExpected.daysBefore) || 0)),
            title: 'Ovulation day',
            body: `Predicted ovulation: ${ovulation.toLocaleDateString([], { month: 'short', day: 'numeric' })}.`,
          });
        }
        if (n.fertileWindow?.enabled) {
          targets.push({
            event: 'fertileWindow',
            day: offsetDayKey(fertileStart, -(Number(n.fertileWindow.daysBefore) || 0)),
            title: 'Fertile window opens',
            body: 'Predicted start of your fertile window.',
          });
        }
        if (n.pmsWindow?.enabled) {
          targets.push({
            event: 'pmsWindow',
            day: offsetDayKey(nextPeriod, -(Number(n.pmsWindow.daysBefore) || 5)),
            title: 'PMS window',
            body: 'Period coming up — good moment to log how you\'re feeling.',
          });
        }
        if (n.latePeriod?.enabled) {
          targets.push({
            event: 'latePeriod',
            day: offsetDayKey(nextPeriod, Number(n.latePeriod.daysAfter) || 2),
            title: 'Period is late',
            body: 'Your predicted period date has passed. Update Last period start when it begins.',
          });
        }

        for (const t of targets) {
          if (t.day !== todayKey) continue;
          const tag = `cycle:${t.event}:${todayKey}`;
          log.info({ userId: uid, event: t.event, tz, hhmm }, 'scheduler: firing cycle notification');
          const result = await sendToUser(uid, 'menstruationReminder', {
            title: t.title,
            body: t.body,
            url: '/profile/settings/menstruation',
            category: 'menstruationReminder',
            tag,
            data: { event: t.event },
          });
          log.info({ userId: uid, event: t.event, ...result }, 'scheduler: cycle notification fanout');
        }
      }
    }

    // Fasting notifications. Two events fire (per user toggle): fastStart
    // at the planned/actual start instant, fastEnd at the planned end. Logic
    // is in shared/logging/fasting.js (testable, runs identically client + server).
    // We pass the user-tz hhmm + weekday so recurring rules anchor on local
    // wall-clock independent of server tz / DST drift.
    const f = settings.fasting;
    if (f?.enabled && f.notifications?.enabled) {
      // Pull recent + upcoming events: anything whose start or end could fall
      // within ±2h of `now`. Window is generous to cover server lag, retroactive
      // edits, and the helper's same-minute matching for actualStart instants
      // logged by manual_start. No timezone math here — instants are absolute.
      const winMs = 2 * 60 * 60 * 1000;
      const lo = new Date(now.getTime() - winMs);
      const hi = new Date(now.getTime() + winMs);
      const fevents = await FastingEvent.find({
        userId: uid,
        $or: [
          { plannedStartAt: { $gte: lo, $lte: hi } },
          { plannedEndAt:   { $gte: lo, $lte: hi } },
          { actualStartAt:  { $gte: lo, $lte: hi } },
          { actualEndAt:    { $gte: lo, $lte: hi } },
          { actualStartAt: { $ne: null }, actualEndAt: null },
        ],
      }).lean();

      const userWeekday = weekdayInZone(now, tz);
      const fastNotifs = computeFastingNotifications({
        schedule: f,
        events: fevents,
        now,
        userHhmm: hhmm,
        userWeekday,
      });

      for (const t of fastNotifs) {
        log.info({ userId: uid, kind: t.kind, tz, hhmm }, 'scheduler: firing fasting notification');
        const result = await sendToUser(uid, 'fastingReminder', {
          title: t.title,
          body: t.body,
          url: '/profile/settings/fasting',
          category: 'fastingReminder',
          tag: t.tag,
          data: { kind: t.kind, eventId: t.eventId ? String(t.eventId) : null },
        });
        log.info({ userId: uid, kind: t.kind, ...result }, 'scheduler: fasting notification fanout');
      }
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

// Read-only handle to the running agenda instance. Returns null until
// startScheduler() has finished — admin tools (Agendash) lazy-resolve so
// they don't blow up during boot.
export function getAgenda() {
  return agenda;
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
