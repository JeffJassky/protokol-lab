export function localYmd(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// Shift a YYYY-MM-DD string by `n` days, in local-calendar terms.
// Day-scoped fetches widen the server window by ±1 day to absorb tz
// drift (server filters by UTC midnight bounds, but log timestamps
// can straddle the local→UTC day boundary).
export function shiftYmd(ymd, n) {
  if (!ymd || typeof ymd !== 'string') return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return localYmd(dt);
}

// Resolve a meal/log timestamp from a YYYY-MM-DD target day. If the
// target is today, return ISO of "now" (so the entry reflects when
// the user actually logged it). For backfills (any other day), anchor
// to noon LOCAL time on that day — avoids stacking every backfill on
// the same server-of-the-moment hour, which is what made the sim
// chart show all of May 3's meals at 8am.
export function isoForLogDate(ymd) {
  if (!ymd || typeof ymd !== 'string') return new Date().toISOString();
  if (ymd === localYmd()) return new Date().toISOString();
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
