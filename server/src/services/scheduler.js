import { Agenda } from 'agenda';
import { MongoBackend } from '@agendajs/mongo-backend';
import mongoose from 'mongoose';
import Compound from '../models/Compound.js';
import UserSettings from '../models/UserSettings.js';
import WeightLog from '../models/WeightLog.js';
import FoodLog from '../models/FoodLog.js';
import SymptomLog from '../models/SymptomLog.js';
import DoseLog from '../models/DoseLog.js';
import { sendToUser } from './push.js';

const MINUTE = 60 * 1000;

let agenda = null;

// Formats `date` as "HH:mm" in the given IANA tz.
// Uses Intl.DateTimeFormat so we don't pull in a date library.
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
  } catch {
    return { hhmm: '00:00' };
  }
}

// Local YYYY-MM-DD for `date` in the given IANA tz.
function localDayKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

// Whole-day count between two YYYY-MM-DD strings (b - a).
function daysBetweenDayKeys(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Start-of-day boundaries in the given timezone expressed in UTC — used to
// ask "did this user log anything today (in their local day)?"
function dayBoundsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  // Compute UTC instants for local midnight and next midnight. We construct
  // a local-midnight ISO string, then figure the UTC offset by asking Intl
  // for the same moment in the target zone.
  const startLocal = new Date(Date.UTC(y, m - 1, d));
  // Adjust for tz offset by shifting startLocal until the formatted date ==
  // target date and time == 00:00.
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
  // Round to the minute so two ticks in the same minute use identical times.
  now.setSeconds(0, 0);

  // Only iterate users who have at least one reminder source enabled. A full
  // table scan per minute is fine for this scale; revisit if the user count
  // crosses ~50k.
  const users = await UserSettings.find({
    $or: [
      { 'trackReminder.enabled': true },
    ],
  }).select('userId timezone trackReminder').lean();

  // Also pull users who have compound reminders — their settings may not
  // have trackReminder enabled.
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

  for (const [uid, settings] of settingsByUser) {
    const tz = settings.timezone || 'UTC';
    const { hhmm } = formatInZone(now, tz);
    const todayKey = localDayKey(now, tz);

    // Compound dose reminders. Dose days are inferred from intervalDays + the
    // user's most recent DoseLog for the compound. Fire only when due (today
    // or overdue) and not yet logged today.
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
        if (lastKey === todayKey) continue; // already logged today
        const required = Math.max(1, Math.ceil(interval));
        if (daysBetweenDayKeys(lastKey, todayKey) < required) continue;
      }
      // No prior dose → due immediately.

      const minuteKey = `${now.toISOString().slice(0, 16)}`;
      await sendToUser(uid, 'doseReminder', {
        title: `Time for ${c.name}`,
        body: 'Tap to log your dose.',
        url: '/',
        category: 'doseReminder',
        tag: `dose:${c._id}:${minuteKey}`,
        data: { compoundId: String(c._id) },
      });
    }

    // Daily tracking reminder — skip if user already logged anything today
    // in their local day.
    if (settings.trackReminder?.enabled && settings.trackReminder.time === hhmm) {
      const { start, end } = dayBoundsInZone(now, tz);
      const logged = await userLoggedToday(uid, start, end);
      if (!logged) {
        const minuteKey = `${now.toISOString().slice(0, 16)}`;
        await sendToUser(uid, 'trackReminder', {
          title: "Don't forget to log today",
          body: 'Weight, meals, symptoms — a quick tap keeps the trend honest.',
          url: '/',
          category: 'trackReminder',
          tag: `track:${minuteKey}`,
        });
      }
    }
  }
}

export async function startScheduler() {
  if (agenda) return agenda;
  if (mongoose.connection.readyState !== 1) {
    console.warn('[scheduler] mongoose not connected — deferring');
    return null;
  }

  // Agenda v6 moved storage to pluggable backends — feed it the already-open
  // Mongo Db instance so we don't hold two connections.
  agenda = new Agenda({
    backend: new MongoBackend({ mongo: mongoose.connection.db }),
    processEvery: 30 * 1000,
    defaultLockLifetime: 60 * 1000,
  });

  agenda.define('reminder-tick', { lockLifetime: 60 * 1000 }, async () => {
    try {
      await runTick();
    } catch (err) {
      console.error('[scheduler] tick failed', err);
    }
  });

  await agenda.start();
  // Keep a single tick job running forever. every('1 minute') is replaced on
  // each call, so restarts don't stack jobs.
  await agenda.every('1 minute', 'reminder-tick');
  console.log('[scheduler] started');
  return agenda;
}

export async function stopScheduler() {
  if (!agenda) return;
  await agenda.stop();
  agenda = null;
}
