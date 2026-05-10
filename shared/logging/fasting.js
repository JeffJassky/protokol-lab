// Pure fasting time-math. No imports — safe for both client and server.
//
// Two inputs feed every computation:
//   - schedule (UserSettings.fasting): declarative recurring rule
//   - events (FastingEvent[]): one-offs, manual starts, in-progress fasts
//
// Output: a FastingStatus describing the user's current state, which the
// banner renders directly. Time-of-day for recurring fasts is interpreted in
// the user's IANA timezone (captured at save time on the schedule).

export const FASTING_PROTOCOLS = [
  { value: '14:10', label: '14:10', fastHours: 14, eatHours: 10 },
  { value: '16:8',  label: '16:8',  fastHours: 16, eatHours: 8 },
  { value: '18:6',  label: '18:6',  fastHours: 18, eatHours: 6 },
  { value: '20:4',  label: '20:4',  fastHours: 20, eatHours: 4 },
  { value: 'OMAD',  label: 'OMAD (23:1)', fastHours: 23, eatHours: 1 },
  { value: 'custom', label: 'Custom', fastHours: null, eatHours: null },
];

export function protocolDurationMinutes(value) {
  const p = FASTING_PROTOCOLS.find((x) => x.value === value);
  if (!p || p.fastHours == null) return null;
  return p.fastHours * 60;
}

// Fasting "stages" with elapsed-minute thresholds. Boundaries follow the
// common consumer-fasting framing (glucose → glycogen depletion → ketosis →
// deep ketosis); thresholds are loose, not clinically precise.
export const STAGE_THRESHOLDS = [
  { minMinutes: 0,       label: 'Burning carbs' },
  { minMinutes: 12 * 60, label: 'Switching to fat' },
  { minMinutes: 18 * 60, label: 'Ketosis' },
  { minMinutes: 48 * 60, label: 'Deep ketosis' },
];

export function stageForElapsedMinutes(minutes) {
  let label = STAGE_THRESHOLDS[0].label;
  for (const s of STAGE_THRESHOLDS) {
    if (minutes >= s.minMinutes) label = s.label;
  }
  return label;
}

// Parse "HH:MM" (24h) → { hours, minutes }. Returns null on malformed input.
function parseHm(s) {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { hours: h, minutes: mm };
}

// Minutes since UTC epoch for "wall clock H:M on the given UTC date" — used
// to walk back/forward day-by-day looking for fast windows. Note this treats
// HH:MM as the *device timezone*'s wall clock, which we get for free since
// browser Date constructor uses the host tz. Server-side scheduling uses the
// stored iana_tz string, but the live banner runs in the user's device tz —
// for a user on the move this is the right answer.
function dateAtLocalHm(baseDate, hm) {
  const d = new Date(baseDate);
  d.setHours(hm.hours, hm.minutes, 0, 0);
  return d;
}

// Resolve which scheduled fast (if any) covers `now` based on the recurring
// rule. Returns { startAt, endAt } in absolute Date instants, or null when
// the user is in the eating window. Walks the previous, current, and next
// day's wall-clock starts so a fast spanning midnight is found correctly.
function resolveScheduledFast(schedule, now) {
  if (!schedule || !schedule.enabled || schedule.kind === 'none') return null;
  const startHm = parseHm(schedule.dailyStartTime || '20:00');
  if (!startHm) return null;
  const durationMin = Number(schedule.fastDurationMinutes) || 0;
  if (durationMin <= 0) return null;

  // For weekly mode, build a per-weekday lookup of {startTime, durationMinutes}.
  // Daily mode reuses the top-level start/duration for every day.
  function ruleForWeekday(weekday) {
    if (schedule.kind === 'daily') {
      return { startHm, durationMin };
    }
    if (schedule.kind === 'weekly' && Array.isArray(schedule.weeklyRules)) {
      const r = schedule.weeklyRules.find((x) => x && x.weekday === weekday);
      if (!r) return null;
      const hm = parseHm(r.startTime || schedule.dailyStartTime || '20:00');
      const dm = Number(r.durationMinutes) || durationMin;
      if (!hm || dm <= 0) return null;
      return { startHm: hm, durationMin: dm };
    }
    return null;
  }

  // Look at fasts that started yesterday, today, and tomorrow — covers any
  // window that could include `now`.
  for (const offset of [-1, 0, 1]) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const weekday = day.getDay();
    const rule = ruleForWeekday(weekday);
    if (!rule) continue;
    const startAt = dateAtLocalHm(day, rule.startHm);
    const endAt = new Date(startAt.getTime() + rule.durationMin * 60 * 1000);
    if (now >= startAt && now < endAt) return { startAt, endAt, source: 'scheduled' };
  }
  return null;
}

// Find the next scheduled fast strictly after `now`. Looks ahead 7 days max.
function resolveNextScheduledFast(schedule, now) {
  if (!schedule || !schedule.enabled || schedule.kind === 'none') return null;
  const startHm = parseHm(schedule.dailyStartTime || '20:00');
  if (!startHm) return null;
  const durationMin = Number(schedule.fastDurationMinutes) || 0;
  if (durationMin <= 0) return null;

  function ruleForWeekday(weekday) {
    if (schedule.kind === 'daily') return { startHm, durationMin };
    if (schedule.kind === 'weekly' && Array.isArray(schedule.weeklyRules)) {
      const r = schedule.weeklyRules.find((x) => x && x.weekday === weekday);
      if (!r) return null;
      const hm = parseHm(r.startTime || schedule.dailyStartTime || '20:00');
      const dm = Number(r.durationMinutes) || durationMin;
      if (!hm || dm <= 0) return null;
      return { startHm: hm, durationMin: dm };
    }
    return null;
  }

  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + offset);
    const weekday = day.getDay();
    const rule = ruleForWeekday(weekday);
    if (!rule) continue;
    const startAt = dateAtLocalHm(day, rule.startHm);
    if (startAt > now) {
      const endAt = new Date(startAt.getTime() + rule.durationMin * 60 * 1000);
      return { startAt, endAt, source: 'scheduled' };
    }
  }
  return null;
}

// Pick the active event from the events array. Active = actualStartAt set,
// actualEndAt null. Falls back to the most recent matching one if multiple
// (shouldn't happen in practice — server validates).
function pickActiveEvent(events) {
  if (!Array.isArray(events)) return null;
  const active = events
    .filter((e) => e && e.actualStartAt && !e.actualEndAt)
    .sort((a, b) => new Date(b.actualStartAt) - new Date(a.actualStartAt));
  return active[0] || null;
}

// Pick the soonest upcoming one-off event whose planned start lies after now.
function pickNextOneOff(events, now) {
  if (!Array.isArray(events)) return null;
  const upcoming = events
    .filter((e) => e && e.source === 'one_off' && !e.actualStartAt && new Date(e.plannedStartAt) > now)
    .sort((a, b) => new Date(a.plannedStartAt) - new Date(b.plannedStartAt));
  return upcoming[0] || null;
}

// Main entry point. Pass the current settings.fasting block and the user's
// recent FastingEvent[] (open/upcoming). Returns the status the banner needs.
//
// Status values:
//   - 'disabled'         — feature off; banner hidden
//   - 'active'           — currently fasting, before goal
//   - 'past_goal'        — currently fasting, planned end has passed
//   - 'eating'           — eating window with a known next fast (countdown)
//   - 'eating_no_next'   — eating window, no scheduled fast (banner hides)
export function computeFastingStatus(schedule, events, now = new Date()) {
  if (!schedule || !schedule.enabled) {
    return { state: 'disabled' };
  }

  // 1. Highest priority: an actively-running event.
  const active = pickActiveEvent(events);
  if (active) {
    const startAt = new Date(active.actualStartAt);
    const plannedEnd = active.plannedEndAt ? new Date(active.plannedEndAt) : null;
    const elapsedMin = Math.max(0, Math.round((now - startAt) / 60000));
    const remainingMin = plannedEnd ? Math.round((plannedEnd - now) / 60000) : null;
    const state = plannedEnd && now >= plannedEnd ? 'past_goal' : 'active';
    return {
      state,
      eventId: active._id || active.id || null,
      startAt,
      plannedEnd,
      elapsedMinutes: elapsedMin,
      remainingMinutes: remainingMin,
      stage: stageForElapsedMinutes(elapsedMin),
      progress: plannedEnd
        ? Math.min(1, elapsedMin / Math.max(1, (plannedEnd - startAt) / 60000))
        : 0,
      source: active.source || 'manual_start',
    };
  }

  // 2. Currently inside a scheduled fast window (auto-active even if user
  //    didn't tap "start"). The server materializes a FastingEvent the first
  //    time this is observed; the banner treats it as active either way.
  const scheduledNow = resolveScheduledFast(schedule, now);
  if (scheduledNow) {
    const elapsedMin = Math.max(0, Math.round((now - scheduledNow.startAt) / 60000));
    const remainingMin = Math.round((scheduledNow.endAt - now) / 60000);
    return {
      state: 'active',
      eventId: null,
      startAt: scheduledNow.startAt,
      plannedEnd: scheduledNow.endAt,
      elapsedMinutes: elapsedMin,
      remainingMinutes: remainingMin,
      stage: stageForElapsedMinutes(elapsedMin),
      progress: Math.min(1, elapsedMin / Math.max(1, (scheduledNow.endAt - scheduledNow.startAt) / 60000)),
      source: 'scheduled',
    };
  }

  // 3. Eating window — show countdown to the next fast (one-off beats schedule
  //    if it lands sooner).
  const nextScheduled = resolveNextScheduledFast(schedule, now);
  const nextOneOff = pickNextOneOff(events, now);
  let next = null;
  if (nextScheduled && nextOneOff) {
    next =
      new Date(nextOneOff.plannedStartAt) < nextScheduled.startAt
        ? { startAt: new Date(nextOneOff.plannedStartAt), endAt: new Date(nextOneOff.plannedEndAt), source: 'one_off' }
        : nextScheduled;
  } else {
    next = nextScheduled || (nextOneOff
      ? { startAt: new Date(nextOneOff.plannedStartAt), endAt: new Date(nextOneOff.plannedEndAt), source: 'one_off' }
      : null);
  }

  if (next) {
    const minutesUntilStart = Math.round((next.startAt - now) / 60000);
    return {
      state: 'eating',
      nextStartAt: next.startAt,
      nextEndAt: next.endAt,
      minutesUntilNext: minutesUntilStart,
      source: next.source,
    };
  }
  return { state: 'eating_no_next' };
}

// Build the list of fasting notifications that should fire this minute.
//
// Inputs:
//   - schedule:   UserSettings.fasting (with .notifications subdoc)
//   - events:     recent FastingEvent[] (active + upcoming one-offs)
//   - now:        Date — should be the scheduler tick instant
//   - userHhmm:   "HH:MM" of `now` rendered in the user's tz (the scheduler
//                 already computes this for every user). Recurring rules use
//                 this to fire at the right wall-clock minute regardless of
//                 server tz / DST.
//   - userWeekday: 0–6 weekday of `now` in the user's tz, for `kind=weekly`.
//
// Output: array of { kind, title, body, tag, eventId } — tag is stable per
// (event, kind) so the scheduler can dedupe across overlapping ticks.
//
// Two events are dispatched (per user-chosen toggle):
//   - fastStart: at the fast's planned start instant
//   - fastEnd:   at the fast's planned end instant (target reached)
//
// We fire when the relevant instant falls within the *current* minute. The
// scheduler runs every minute on a 30s heartbeat with up to 60s lock — a
// 1-minute window matches that cadence with no double-fire risk because of
// the stable tag.
export function computeFastingNotifications({
  schedule,
  events,
  now,
  userHhmm,
  userWeekday,
}) {
  const out = [];
  if (!schedule || !schedule.enabled) return out;
  const n = schedule.notifications;
  if (!n || !n.enabled) return out;
  const fireStart = n.fastStart?.enabled !== false;
  const fireEnd = n.fastEnd?.enabled !== false;
  if (!fireStart && !fireEnd) return out;
  const startLead = Math.max(0, Math.min(720, Number(n.fastStart?.minutesBefore) || 0));
  const endLead   = Math.max(0, Math.min(720, Number(n.fastEnd?.minutesBefore)   || 0));

  const minuteKey = formatMinuteKey(now);
  const sameMinute = (instant) => formatMinuteKey(instant) === minuteKey;

  // 1. Recurring schedule. The rule is anchored on user-local wall-clock —
  //    compare HH:MM directly (no Date math, so DST jitter is irrelevant).
  //    Lead time shifts the trigger HH:MM backward modulo 24h so a "30 min
  //    before 20:00" alert lands at 19:30 the same day, and "60 min before
  //    00:30" wraps to 23:30 the previous day. The wrap is correct because
  //    the user's wall clock at "yesterday 23:30" is the same minute we
  //    want to fire — the rule is purely time-of-day.
  if (schedule.kind === 'daily' || schedule.kind === 'weekly') {
    const rule = ruleForUserDay(schedule, userWeekday);
    if (rule) {
      if (fireStart) {
        const triggerHhmm = addMinutesToHhmm(rule.startTime, -startLead);
        if (triggerHhmm === userHhmm) {
          // Compute the "real" planned start = now + leadMinutes so the
          // notification copy can name the imminent event. This is correct
          // when leadTime is 0 (now == start) and when >0 (now < start).
          const plannedStart = new Date(now.getTime() + startLead * 60_000);
          const plannedEnd = new Date(plannedStart.getTime() + rule.durationMin * 60_000);
          out.push(buildStartNotif({
            minuteKey: formatMinuteKey(plannedStart),
            leadMinutes: startLead,
            plannedStart,
            plannedEnd,
          }));
        }
      }
      if (fireEnd) {
        const endHhmm = addMinutesToHhmm(rule.startTime, rule.durationMin);
        const triggerHhmm = addMinutesToHhmm(endHhmm, -endLead);
        if (triggerHhmm === userHhmm) {
          const plannedEnd = new Date(now.getTime() + endLead * 60_000);
          out.push(buildEndNotif({
            minuteKey: formatMinuteKey(plannedEnd),
            leadMinutes: endLead,
            plannedEnd,
          }));
        }
      }
    }
  }

  // 2. Per-event triggers (manual starts, one-offs, retroactive edits). We
  //    check both planned and actual instants so a manual-start fast still
  //    fires at the moment the user tapped Start. Lead-time shifts the
  //    trigger instant earlier; we still tag by the real start/end so
  //    multiple ticks (or recurring + event paths) collapse to one notif.
  if (Array.isArray(events)) {
    for (const ev of events) {
      if (!ev) continue;
      const id = ev._id || ev.id || null;
      const startInstant = ev.actualStartAt
        ? new Date(ev.actualStartAt)
        : (ev.plannedStartAt ? new Date(ev.plannedStartAt) : null);
      const endInstant = ev.actualEndAt
        ? new Date(ev.actualEndAt)
        : (ev.plannedEndAt ? new Date(ev.plannedEndAt) : null);

      if (fireStart && startInstant) {
        const trigger = new Date(startInstant.getTime() - startLead * 60_000);
        // Skip pre-fast lead alerts for fasts that already started — the
        // user tapped Start manually, the moment is now, not earlier.
        const skipLead = startLead > 0 && Boolean(ev.actualStartAt);
        if (!skipLead && sameMinute(trigger)) {
          out.push(buildStartNotif({
            minuteKey: formatMinuteKey(startInstant),
            leadMinutes: startLead,
            eventId: id,
            plannedStart: startInstant,
            plannedEnd: endInstant,
          }));
        }
      }
      // Only fire end-of-fast for events that are currently underway. A
      // pure "scheduled" event with no actualStartAt represents an
      // upcoming planned fast — its end instant is the recurring rule's
      // end above, not a separate event-driven trigger.
      const isUnderway = ev.actualStartAt && !ev.actualEndAt;
      if (fireEnd && endInstant && (isUnderway || ev.source === 'one_off')) {
        const trigger = new Date(endInstant.getTime() - endLead * 60_000);
        if (sameMinute(trigger)) {
          out.push(buildEndNotif({
            minuteKey: formatMinuteKey(endInstant),
            leadMinutes: endLead,
            eventId: id,
            plannedEnd: endInstant,
          }));
        }
      }
    }
  }

  // Dedupe by tag — recurring + event paths can both produce a hit when an
  // event was materialized at the same minute as the rule. Tag is
  // (kind, minute) so both paths collapse to one notification.
  const seen = new Set();
  return out.filter((t) => {
    if (seen.has(t.tag)) return false;
    seen.add(t.tag);
    return true;
  });
}

function ruleForUserDay(schedule, userWeekday) {
  const startTime = parseHm(schedule.dailyStartTime || '20:00') ? schedule.dailyStartTime : '20:00';
  const durationMin = Number(schedule.fastDurationMinutes) || 0;
  if (durationMin <= 0) return null;

  if (schedule.kind === 'daily') {
    return { startTime, durationMin };
  }
  if (schedule.kind === 'weekly' && Array.isArray(schedule.weeklyRules)) {
    const r = schedule.weeklyRules.find((x) => x && x.weekday === userWeekday);
    if (!r) return null;
    const ruleStart = parseHm(r.startTime) ? r.startTime : startTime;
    const ruleDur = Number(r.durationMinutes) || durationMin;
    if (!parseHm(ruleStart) || ruleDur <= 0) return null;
    return { startTime: ruleStart, durationMin: ruleDur };
  }
  return null;
}

function addMinutesToHhmm(hhmm, addMin) {
  const hm = parseHm(hhmm);
  if (!hm) return null;
  const total = (hm.hours * 60 + hm.minutes + Math.round(addMin)) % (24 * 60);
  const wrapped = (total + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatMinuteKey(d) {
  // YYYY-MM-DDTHH:MM (UTC) — dedupes across ticks within the same minute,
  // and (combined with the rule key) across days too.
  return new Date(d).toISOString().slice(0, 16);
}

function buildStartNotif({ minuteKey, leadMinutes = 0, eventId = null, plannedStart, plannedEnd }) {
  const startLabel = plannedStart
    ? new Date(plannedStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const endLabel = plannedEnd
    ? new Date(plannedEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  if (leadMinutes > 0) {
    return {
      kind: 'fastStart',
      title: 'Fast starting soon',
      body: startLabel
        ? `Fast begins at ${startLabel} — ${formatLead(leadMinutes)} to go.`
        : `Fast begins in ${formatLead(leadMinutes)}.`,
      tag: `fasting:start:${minuteKey}`,
      eventId,
    };
  }
  return {
    kind: 'fastStart',
    title: 'Fast started',
    body: endLabel
      ? `Fast underway. Goal: ${endLabel}.`
      : 'Your fast is underway.',
    tag: `fasting:start:${minuteKey}`,
    eventId,
  };
}

function buildEndNotif({ minuteKey, leadMinutes = 0, eventId = null, plannedEnd }) {
  const endLabel = plannedEnd
    ? new Date(plannedEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  if (leadMinutes > 0) {
    return {
      kind: 'fastEnd',
      title: 'Fast ending soon',
      body: endLabel
        ? `Goal at ${endLabel} — ${formatLead(leadMinutes)} to go.`
        : `Goal reached in ${formatLead(leadMinutes)}.`,
      tag: `fasting:end:${minuteKey}`,
      eventId,
    };
  }
  return {
    kind: 'fastEnd',
    title: 'Fast complete',
    body: 'Goal reached. You can break your fast now.',
    tag: `fasting:end:${minuteKey}`,
    eventId,
  };
}

function formatLead(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (mm === 0) return h === 1 ? '1 hour' : `${h} hours`;
  return `${h}h ${mm}m`;
}

// Format minutes as compact "Hh Mm" / "Mm". Negative input clamps to "0m".
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}
