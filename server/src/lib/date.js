// Storage convention for "date-only" log entries (DoseLog, WeightLog, FoodLog,
// SymptomLog, DayNote, etc): when the client sends a YYYY-MM-DD string, parse
// it as 12:00:00 UTC. The noon-UTC instant formats to the same calendar day
// in any timezone -11..+11, so the user's local-day intent round-trips
// through the scheduler's `localDayKey` formatter without drifting.
//
// Without this, `new Date('2026-05-01')` returns 2026-05-01T00:00:00Z, which
// formats as the *previous* local day for any user west of UTC and breaks
// "did the user log this on day X" checks (notably dose-reminder scheduling).

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseLogDate(input) {
  if (typeof input === 'string' && YMD_RE.test(input)) {
    return new Date(`${input}T12:00:00Z`);
  }
  return new Date(input);
}

export function ymdDayBounds(input) {
  const start = parseLogDate(input);
  if (typeof input === 'string' && YMD_RE.test(input)) {
    start.setUTCHours(0, 0, 0, 0);
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}
