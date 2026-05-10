// Cycle-day → phase math. Pure functions over the user's
// menstruation settings:
//   { lastPeriodStart, cycleLength, lutealPhaseLength, periodLength }
//
// Used by the cycle banner on the log page, the chart-banner copy,
// the agent's daily context, and any predictive notifications.

const DAY_MS = 86_400_000;

const PHASES = Object.freeze({
  menstrual: 'menstrual',
  follicular: 'follicular',
  ovulation: 'ovulation',
  luteal: 'luteal',
});

// Number of cycle days the average ovulation window spans. Centered
// on the predicted ovulation day (cycleLength − lutealPhaseLength).
const OVULATION_WINDOW = 3;

function dayDiff(a, b) {
  // Day-precision diff that ignores time-of-day so a cycle that
  // started at 11pm doesn't off-by-one the very next day.
  const aD = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bD = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((aD - bD) / DAY_MS);
}

// Cycle day (1-indexed) for a given calendar day, given the user's
// last-period-start anchor + average cycle length. Cycles past the
// nominal length wrap — day 32 of a 28-day cycle is day 4 of the next.
export function cycleDayFor({ lastPeriodStart, cycleLength = 28 }, asOf = new Date()) {
  if (!lastPeriodStart) return null;
  const start = new Date(lastPeriodStart);
  if (Number.isNaN(start.getTime())) return null;
  const len = Math.max(20, Math.min(45, Number(cycleLength) || 28));
  const elapsed = dayDiff(asOf, start);
  if (elapsed < 0) return null;
  return (elapsed % len) + 1;
}

// Phase for a given cycle day. Boundaries:
//   menstrual    days 1 .. periodLength
//   follicular   periodLength+1 .. ovulation−1
//   ovulation    ovulation−1 .. ovulation+1 (3-day window, configurable)
//   luteal       ovulation+2 .. cycleLength
export function phaseFor({
  cycleDay,
  cycleLength = 28,
  lutealPhaseLength = 14,
  periodLength = 5,
}) {
  if (!Number.isFinite(cycleDay) || cycleDay < 1) return null;
  const len = Math.max(20, Math.min(45, Number(cycleLength) || 28));
  const luteal = Math.max(10, Math.min(20, Number(lutealPhaseLength) || 14));
  const period = Math.max(1, Math.min(10, Number(periodLength) || 5));
  const ovulation = len - luteal;
  const ovStart = Math.max(1, ovulation - Math.floor(OVULATION_WINDOW / 2));
  const ovEnd = ovulation + Math.floor(OVULATION_WINDOW / 2);

  if (cycleDay <= period) return PHASES.menstrual;
  if (cycleDay >= ovStart && cycleDay <= ovEnd) return PHASES.ovulation;
  if (cycleDay > ovEnd) return PHASES.luteal;
  return PHASES.follicular;
}

// Day-precision elapsed days from `lastPeriodStart` to `asOf`. Negative
// when `asOf` is before the anchor; null when no anchor or invalid date.
// Used by both the UI banner and the server-side plausibility checks so
// they agree on whether "period started this day" is reasonable.
export function elapsedDaysSinceStart({ lastPeriodStart }, asOf = new Date()) {
  if (!lastPeriodStart) return null;
  const start = new Date(lastPeriodStart);
  if (Number.isNaN(start.getTime())) return null;
  return dayDiff(asOf, start);
}

// Whether marking `asOf` as a fresh period start is biologically plausible
// given the user's existing anchor + cycle length. Three accept cases:
//   - no anchor yet (initial seed)
//   - early days (<7 since start) — user correcting an under-log
//   - late luteal onward (≥ cycleLength − GRACE) — PMS through indefinite,
//     open-ended upper bound to cover irregular cycles (PCOS, perimenopause,
//     post-partum) where a new period can land 30+ days late
// Hidden in the deep mid-cycle window where a fresh start isn't plausible,
// and on the anchor day itself (already set).
//
// `graceDays` is the irregularity tolerance — how far before the expected
// next period to start accepting "it's here". Defaults to 7d which covers
// most cycle variability without spanning the whole follicular phase.
const DEFAULT_PLAUSIBILITY_GRACE_DAYS = 7;
export function isPeriodStartPlausible(
  { lastPeriodStart, cycleLength = 28 },
  asOf = new Date(),
  { graceDays = DEFAULT_PLAUSIBILITY_GRACE_DAYS } = {},
) {
  if (!lastPeriodStart) return true;
  const elapsed = elapsedDaysSinceStart({ lastPeriodStart }, asOf);
  if (elapsed == null) return false;
  if (elapsed === 0) return false; // already the anchor day
  if (elapsed < 0) return false;   // viewing before the known start
  const len = Math.max(20, Math.min(45, Number(cycleLength) || 28));
  return elapsed < graceDays || elapsed >= len - graceDays;
}

// Predicted next event dates — useful for both UI banners and agent
// reasoning ("your next period is in 4 days").
export function predictNextEvents(
  { lastPeriodStart, cycleLength = 28, lutealPhaseLength = 14, periodLength = 5 },
  asOf = new Date(),
) {
  if (!lastPeriodStart) return null;
  const start = new Date(lastPeriodStart);
  if (Number.isNaN(start.getTime())) return null;
  const len = Math.max(20, Math.min(45, Number(cycleLength) || 28));
  const luteal = Math.max(10, Math.min(20, Number(lutealPhaseLength) || 14));
  const ovulationDayInCycle = len - luteal;

  const elapsed = dayDiff(asOf, start);
  const cyclesElapsed = Math.max(0, Math.floor(elapsed / len));
  const cycleStart = new Date(start.getTime() + cyclesElapsed * len * DAY_MS);

  const nextOvulation = new Date(cycleStart.getTime() + (ovulationDayInCycle - 1) * DAY_MS);
  const nextPeriod = new Date(cycleStart.getTime() + len * DAY_MS);

  // If the predicted ovulation is already in the past for this cycle,
  // bump to the next one.
  const ov = nextOvulation.getTime() < asOf.getTime()
    ? new Date(nextOvulation.getTime() + len * DAY_MS)
    : nextOvulation;

  return {
    cycleStart,
    nextOvulation: ov,
    nextPeriod,
    daysUntilNextPeriod: Math.max(0, dayDiff(nextPeriod, asOf)),
    daysUntilNextOvulation: Math.max(0, dayDiff(ov, asOf)),
    periodLength: Math.max(1, Math.min(10, Number(periodLength) || 5)),
  };
}

export const MENSTRUAL_PHASES = PHASES;
