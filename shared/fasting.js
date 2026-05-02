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

// Five fasting "stages" with elapsed-minute thresholds. Stage labels are kept
// short and clinical; the banner shows them as a chip.
const STAGE_THRESHOLDS = [
  { minMinutes: 0,    label: 'Fed' },
  { minMinutes: 4 * 60,  label: 'Catabolic' },
  { minMinutes: 12 * 60, label: 'Fat-burning' },
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

// Format minutes as compact "Hh Mm" / "Mm". Negative input clamps to "0m".
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}
