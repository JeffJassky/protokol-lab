// High-level analysis API. Two consumers depend on this module:
//
//   1. /server/src/routes/analysis.js — thin HTTP wrappers for the
//      dashboard's Insights surface.
//   2. /server/src/services/agent.js  — chat tool handlers invoke these
//      JS functions directly (no HTTP hop).
//
// Each function takes the user id + a plain options object and returns a
// JSON-serializable result. Domain-specific data fetching is delegated to
// series.js; pure math is delegated to primitives.js.

import {
  pearson,
  spearman,
  partialCorrelation,
  linearRegression,
  changePoints as cpPrimitive,
  projectLinear,
  correlationConfidence,
} from './primitives.js';
import {
  fetchSeriesDaily,
  alignDaily,
  listAvailableSeriesIds,
} from './series.js';
import UserSettings from '../models/UserSettings.js';

// Sample-size floors. Returned as null findings rather than fake stats so
// the UI can show "Need more days" instead of a misleading correlation.
const MIN_N_PAIRWISE = 14;
const MIN_N_PARTIAL = 30;
const MIN_R_RELEVANT = 0.25;

// Search for the lag in [-maxLag, +maxLag] that maximizes |r|, re-aligning
// by CALENDAR DATE at each step. The alternative — calling bestLag() on
// pre-aligned position-arrays — silently miscounts when the input has gaps:
// a "7-day shift" in array positions only equals 7 days when the aligned
// arrays have no missing days, which is rarely true for real user data.
// Also threads `method` through so spearman ranking actually works.
function bestLagByDate(seriesA, seriesB, opts = {}) {
  const maxLag = Math.max(0, Math.trunc(Number(opts.maxLag ?? 14)) | 0);
  const minLag = Math.trunc(Number(opts.minLag ?? -maxLag)) | 0;
  const method = opts.method || 'pearson';
  let best = null;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const aligned = alignDaily(seriesA, seriesB, { lag });
    if (aligned.n < 2) continue;
    const r = method === 'spearman'
      ? spearman(aligned.aValues, aligned.bValues)
      : pearson(aligned.aValues, aligned.bValues);
    if (r == null) continue;
    if (!best || Math.abs(r) > Math.abs(best.r)) {
      best = { r, lag, n: aligned.n };
    }
  }
  return best;
}

// Convert raw values to ranks (average rank for ties), 1-based to match the
// Spearman convention. Inlined here so bestLagByDatePartial can rank both
// outcomes and controls before regressing — partial-Spearman = partial-
// Pearson on rank-transformed columns.
function ranksLocal(arr) {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const out = new Array(arr.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[indexed[k].i] = avg;
    i = j + 1;
  }
  return out;
}

// Same lag search as bestLagByDate, but partials out one or more control
// series at each lag step. Controls are anchored to A's day (since lag
// shifts B relative to A) — for the typical "control for calories" call,
// this asks "does A predict B beyond what calories on A's day already
// explain?". Returns null if no lag yields enough overlap with controls.
//
// `method`: 'pearson' (default) or 'spearman'. Spearman ranks A, B, and
// each control before regressing — captures monotonic non-linear partial
// relationships the Pearson form would understate.
function bestLagByDatePartial(seriesA, seriesB, controlSeriesArr, opts = {}) {
  const maxLag = Math.max(0, Math.trunc(Number(opts.maxLag ?? 14)) | 0);
  const minLag = Math.trunc(Number(opts.minLag ?? -maxLag)) | 0;
  const method = opts.method || 'pearson';
  let best = null;
  const dayKeys = [...seriesA.values.keys()].sort();
  for (let lag = minLag; lag <= maxLag; lag++) {
    const aValues = [];
    const bValues = [];
    const cValuesArr = controlSeriesArr.map(() => []);
    for (const day of dayKeys) {
      const av = seriesA.values.get(day);
      if (av == null || !Number.isFinite(av)) continue;
      const bDay = lag === 0 ? day : shiftDay(day, lag);
      const bv = seriesB.values.get(bDay);
      if (bv == null || !Number.isFinite(bv)) continue;
      let allControlsOk = true;
      const cVals = [];
      for (const cs of controlSeriesArr) {
        const cv = cs.values.get(day);
        if (cv == null || !Number.isFinite(cv)) { allControlsOk = false; break; }
        cVals.push(cv);
      }
      if (!allControlsOk) continue;
      aValues.push(av);
      bValues.push(bv);
      cVals.forEach((v, k) => cValuesArr[k].push(v));
    }
    const n = aValues.length;
    if (n < MIN_N_PARTIAL) continue;
    const aIn = method === 'spearman' ? ranksLocal(aValues) : aValues;
    const bIn = method === 'spearman' ? ranksLocal(bValues) : bValues;
    const cIn = method === 'spearman'
      ? cValuesArr.map((col) => ranksLocal(col))
      : cValuesArr;
    const r = partialCorrelation(aIn, bIn, cIn);
    if (r == null) continue;
    if (!best || Math.abs(r) > Math.abs(best.r)) {
      best = { r, lag, n };
    }
  }
  return best;
}

// Domain helpers — used to decide which pairs are "structurally entangled"
// (calories ↔ fat, score ↔ its inputs, GI symptoms ↔ each other) and
// should be skipped or controlled when ranking. The goal is to push the
// pair-scan toward CROSS-domain relationships, which are the ones a
// user couldn't deduce from the data definitions alone.
const NUTRITION_DOMAIN = new Set(['calories', 'protein', 'fat', 'carbs', 'score']);
const SCORE_INPUTS = new Set(['calories', 'protein', 'fat', 'carbs']);
const NUTRIENT_MACROS = new Set(['protein', 'fat', 'carbs']);

function domainOf(seriesId) {
  if (seriesId === 'weight') return 'body';
  // Custom-tracked metrics (waist, arms, body fat, etc.) are body-domain too.
  if (seriesId.startsWith('metric:')) return 'body';
  if (NUTRITION_DOMAIN.has(seriesId)) return 'nutrition';
  if (seriesId.startsWith('dosage:')) return 'compound';
  if (seriesId.startsWith('symptom:')) return 'symptom';
  return 'other';
}

// Pairs that are mathematically self-correlated (one side is computed
// from the other). Skip outright — these can never be insightful.
function isStructurallyTautological(aId, bId) {
  if (aId === 'score' && SCORE_INPUTS.has(bId)) return true;
  if (bId === 'score' && SCORE_INPUTS.has(aId)) return true;
  return false;
}

// Within-domain pairs are usually noise: macros co-recorded from one food
// log, multiple symptoms reflecting one underlying state. Body × body
// (weight × waist, weight × body-fat) is the one within-domain exception
// worth keeping.
function shouldSkipWithinDomain(aId, bId) {
  const dA = domainOf(aId);
  const dB = domainOf(bId);
  if (dA !== dB) return false;
  if (dA === 'body') return false;
  return true;
}

// Macro × non-nutrition asks "does this macro predict X beyond what total
// calories on the same day already do?". Without controlling for calories,
// any macro looks correlated with anything food-driven simply because
// "more food = more of every macro".
function shouldControlForCalories(aId, bId) {
  const aMacro = NUTRIENT_MACROS.has(aId);
  const bMacro = NUTRIENT_MACROS.has(bId);
  if (aMacro && !NUTRITION_DOMAIN.has(bId)) return true;
  if (bMacro && !NUTRITION_DOMAIN.has(aId)) return true;
  return false;
}

// Causal-direction priors. Restricts the lag-search range based on the
// pair's domain so we don't surface findings that imply a backwards causal
// chain (e.g., "gas/bloating rises 8d before retatrutide rises" — symptoms
// don't drive dose schedules). The math is symmetric, but in this domain
// some directions are physically nonsensical, and unrestricted search will
// happily pick up co-trending noise as a phase-shifted "lead".
//
// Returned bounds are (minLag, maxLag) in the convention of bestLagByDate:
// lag>0 means seriesA leads seriesB. Caller passes the bounds straight
// into the lag-search options.
//
// Rules:
//   compound × non-compound: compound leads (it's exogenous — set by
//     schedule, not user state).
//   nutrition × body: nutrition leads (food drives weight; weight today
//     doesn't drive food choice in the next 14 days in any meaningful way).
//   nutrition × symptom: bidirectional — food can cause symptoms AND
//     symptoms (e.g., nausea) can suppress eating.
//   body × symptom: bidirectional — vomiting → weight loss, weight →
//     joint pain, etc.
function lagRangeForPair(aId, bId, maxLag) {
  const dA = domainOf(aId);
  const dB = domainOf(bId);
  if (dA === 'compound' && dB !== 'compound') return { minLag: 0, maxLag };
  if (dB === 'compound' && dA !== 'compound') return { minLag: -maxLag, maxLag: 0 };
  if (dA === 'nutrition' && dB === 'body') return { minLag: 0, maxLag };
  if (dB === 'nutrition' && dA === 'body') return { minLag: -maxLag, maxLag: 0 };
  return { minLag: -maxLag, maxLag };
}

// ---- Public API ---------------------------------------------------------

// Pairwise correlation between two series over a date range, with optional
// lag in days. `lag = 'auto'` searches [-maxLag, +maxLag] for the
// |r|-maximizing shift.
export async function correlate(uid, opts) {
  const { a, b, from, to, lag = 0, maxLag = 14, method = 'pearson' } = opts;
  const cache = {};
  const seriesA = await fetchSeriesDaily(uid, a, from, to, cache);
  const seriesB = await fetchSeriesDaily(uid, b, from, to, cache);

  if (lag === 'auto') {
    // Auto-search re-aligns by date for every candidate lag (see
    // bestLagByDate) so a "7-day shift" really means 7 calendar days even
    // when the user has gaps in their logging.
    const best = bestLagByDate(seriesA, seriesB, { maxLag, method });
    if (!best) {
      return { r: null, n: 0, lag: 0, method, reason: 'flat_series', a, b, from, to };
    }
    if (best.n < MIN_N_PAIRWISE) {
      return { r: null, n: best.n, lag: best.lag, method, reason: 'insufficient_data', a, b, from, to };
    }
    return {
      r: best.r,
      n: best.n,
      lag: best.lag,
      method,
      confidence: correlationConfidence(best.r, best.n),
      a, b, from, to,
    };
  }

  const aligned = alignDaily(seriesA, seriesB, { lag });
  if (aligned.n < MIN_N_PAIRWISE) {
    return { r: null, n: aligned.n, lag, method, reason: 'insufficient_data', a, b, from, to };
  }
  const r = method === 'spearman'
    ? spearman(aligned.aValues, aligned.bValues)
    : pearson(aligned.aValues, aligned.bValues);
  if (r == null) {
    return { r: null, n: aligned.n, lag, method, reason: 'flat_series', a, b, from, to };
  }
  return {
    r,
    n: aligned.n,
    lag,
    method,
    confidence: correlationConfidence(r, aligned.n),
    a, b, from, to,
  };
}

// Rank every candidate series by its correlation strength against a target
// series. For each candidate we auto-select the lag in [-maxLag, +maxLag]
// that maximizes |r|, then sort by confidence (which combines |r| and n).
// Returns only correlations meeting the relevance + sample-size floors.
export async function rankCorrelations(uid, opts) {
  const { target, from, to, candidates, maxLag = 14, method = 'pearson' } = opts;
  const candidateList = Array.isArray(candidates) && candidates.length
    ? candidates
    : (await listAvailableSeriesIds(uid)).filter((id) => id !== target);

  const cache = {};
  const targetSeries = await fetchSeriesDaily(uid, target, from, to, cache);
  const rows = [];
  for (const id of candidateList) {
    if (id === target) continue;
    let series;
    try {
      series = await fetchSeriesDaily(uid, id, from, to, cache);
    } catch {
      continue;
    }
    const best = bestLagByDate(targetSeries, series, { maxLag, method });
    if (!best) continue;
    // Sample-size floor is enforced on the post-lag overlap (bestLagByDate
    // re-aligns at each lag, so n is the calendar-day overlap at the chosen
    // lag, not the position-shift artifact bestLag used to produce).
    if (best.n < MIN_N_PAIRWISE) continue;
    if (Math.abs(best.r) < MIN_R_RELEVANT) continue;
    const confidence = correlationConfidence(best.r, best.n);
    rows.push({
      series: id,
      label: series.label,
      r: best.r,
      lag: best.lag,
      n: best.n,
      method,
      confidence,
    });
  }
  rows.sort((x, y) => y.confidence - x.confidence);
  return { target, from, to, rankings: rows };
}

// Partial correlation: relationship between A and B after removing the
// shared variance with one or more controls. Flags cases where a naive
// pairwise correlation would mislead (e.g., protein↔weight is largely
// driven by calories).
export async function partialCorrelate(uid, opts) {
  const { a, b, controls = [], from, to, lag = 0, method = 'pearson' } = opts;
  const cache = {};
  const seriesA = await fetchSeriesDaily(uid, a, from, to, cache);
  const seriesB = await fetchSeriesDaily(uid, b, from, to, cache);
  const controlSeries = [];
  for (const id of controls) {
    controlSeries.push(await fetchSeriesDaily(uid, id, from, to, cache));
  }
  // Align on dates where ALL of A, B, and every control have a value. Easier
  // to do as nested intersections than to extend alignDaily for N series.
  const days = [];
  const dayKeys = [...seriesA.values.keys()].sort();
  for (const day of dayKeys) {
    const av = seriesA.values.get(day);
    const bDay = lag === 0 ? day : shiftDay(day, lag);
    const bv = seriesB.values.get(bDay);
    if (av == null || bv == null) continue;
    let ok = true;
    for (const cs of controlSeries) {
      if (cs.values.get(day) == null) { ok = false; break; }
    }
    if (ok) days.push(day);
  }
  if (days.length < MIN_N_PARTIAL) {
    return { r: null, partialR: null, n: days.length, controls, reason: 'insufficient_data', a, b };
  }
  const aValues = days.map((d) => seriesA.values.get(d));
  const bValues = days.map((d) => seriesB.values.get(lag === 0 ? d : shiftDay(d, lag)));
  const cMatrix = controlSeries.map((cs) => days.map((d) => cs.values.get(d)));
  const naive = pearson(aValues, bValues);
  const partialR = partialCorrelation(aValues, bValues, cMatrix);
  return {
    r: naive,
    partialR,
    n: days.length,
    controls,
    a, b, from, to, lag,
    method,
    confidence: correlationConfidence(partialR, days.length),
  };
}

function shiftDay(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, '0'),
    String(dt.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

// Detect dates where the trend in a single series shifted significantly.
// By default, uses a 6-month look-back (a change-point question is often
// meaningless if scoped to one side of a shift). Pass `respectWindow: true`
// + an explicit `from` to scope detection to the caller's range — used by
// the insights aggregator so it agrees with the correlation pass on what
// "recent" means.
export async function changePoints(uid, opts) {
  const { series, from, to, window = 14 } = opts;
  const lookbackDays = 180;
  const today = to || isoToday();
  const start = opts.respectWindow && from ? from : shiftDay(today, -lookbackDays);

  const cache = {};
  const s = await fetchSeriesDaily(uid, series, start, today, cache);
  // Build dense daily-index arrays — change-point detection wants a
  // regular sample. Days with no value are skipped (their contribution
  // would distort the local slope).
  const sortedDays = [...s.values.keys()].sort();
  if (sortedDays.length < window * 2 + 1) {
    return { series, points: [], n: sortedDays.length, reason: 'insufficient_data' };
  }
  const t0 = new Date(`${sortedDays[0]}T00:00:00.000Z`).getTime();
  const xs = sortedDays.map((d) =>
    Math.round((new Date(`${d}T00:00:00.000Z`).getTime() - t0) / 86400000),
  );
  const ys = sortedDays.map((d) => s.values.get(d));
  const raw = cpPrimitive(xs, ys, { window });
  const points = raw.map((p) => ({
    date: sortedDays[p.index],
    beforeSlope: p.beforeSlope,
    afterSlope: p.afterSlope,
    magnitude: p.magnitude,
    normalized: p.normalized,
  }));
  return {
    series, label: s.label, unit: s.unit,
    from: start, to: today, n: sortedDays.length,
    points,
  };
}

// Compare two windows for one or more series. Returns mean/slope/total
// for each window plus deltas — answers "what changed when I made this
// adjustment?"
export async function compare(uid, opts) {
  const { series, aFrom, aTo, bFrom, bTo } = opts;
  const ids = Array.isArray(series) ? series : [series];
  const result = { windowA: {}, windowB: {}, deltas: {} };
  for (const id of ids) {
    const seriesA = await fetchSeriesDaily(uid, id, aFrom, aTo);
    const seriesB = await fetchSeriesDaily(uid, id, bFrom, bTo);
    result.windowA[id] = summarizeSeries(seriesA);
    result.windowB[id] = summarizeSeries(seriesB);
    result.deltas[id] = {
      meanDelta: nullable(result.windowB[id].mean, result.windowA[id].mean,
        (b, a) => b - a),
      slopeDelta: nullable(result.windowB[id].slope, result.windowA[id].slope,
        (b, a) => b - a),
    };
  }
  return result;
}

function summarizeSeries(series) {
  const days = [...series.values.keys()].sort();
  if (!days.length) return { n: 0, mean: null, slope: null, total: null };
  const ys = days.map((d) => series.values.get(d));
  const t0 = new Date(`${days[0]}T00:00:00.000Z`).getTime();
  const xs = days.map((d) =>
    Math.round((new Date(`${d}T00:00:00.000Z`).getTime() - t0) / 86400000),
  );
  let total = 0;
  for (const v of ys) total += v;
  const mean = total / ys.length;
  const fit = linearRegression(xs, ys);
  return {
    n: ys.length,
    mean,
    slope: fit?.slope ?? null,
    total,
    label: series.label,
    unit: series.unit,
  };
}

function nullable(a, b, fn) {
  if (a == null || b == null) return null;
  return fn(a, b);
}

// Forward-project a series's recent trend, optionally to a target value.
export async function project(uid, opts) {
  const { series, target = null, from, to, maxDays = 365 } = opts;
  const today = to || isoToday();
  // Use a 60-day window for the projection slope by default — long enough
  // to be stable, short enough to reflect "current" trajectory.
  const start = from || shiftDay(today, -60);
  const s = await fetchSeriesDaily(uid, series, start, today);
  const days = [...s.values.keys()].sort();
  if (days.length < 7) return { series, reason: 'insufficient_data', n: days.length };
  const ys = days.map((d) => s.values.get(d));
  const t0 = new Date(`${days[0]}T00:00:00.000Z`).getTime();
  const xs = days.map((d) =>
    Math.round((new Date(`${d}T00:00:00.000Z`).getTime() - t0) / 86400000),
  );
  const fit = projectLinear(xs, ys, { target, maxDays });
  if (!fit) return { series, reason: 'flat_series', n: days.length };
  const lastDay = days[days.length - 1];
  const projection = fit.projection.map((p) => ({
    date: shiftDay(lastDay, p.daysFromNow),
    value: p.value,
  }));
  let targetReachedOn = null;
  if (fit.targetReachedDay != null) {
    const offset = Math.round(fit.targetReachedDay - xs[xs.length - 1]);
    targetReachedOn = shiftDay(lastDay, offset);
  }
  return {
    series, label: s.label, unit: s.unit,
    slope: fit.slope, intercept: fit.intercept, r2: fit.r2,
    projection, targetReachedOn,
    n: days.length,
  };
}

// Raw daily series for a date range — primarily for the chat agent so it
// can render a chart inline. Returns the same shape as the dashboard's
// series fetchers.
export async function getSeries(uid, opts) {
  const { series, from, to } = opts;
  const s = await fetchSeriesDaily(uid, series, from, to);
  const points = [...s.values.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
  return { series, label: s.label, unit: s.unit, kind: s.kind, points };
}

// Rank EVERY unique (i < j) pair across the supplied series ids by their
// best-lag correlation. Wider net than rankCorrelations(), which scopes to
// a single target. Used by insights() to surface patterns the user didn't
// pre-select — e.g., hunger ↔ calories, fat ↔ symptom, protein ↔ dosage.
//
// Cost: ~k(k-1)/2 pairs × (2*maxLag+1) cheap alignments. With ~15 series
// and maxLag=14 that's ~3k pearson computations on aligned arrays of <=
// (window-in-days). DB cost is one fetchSeriesDaily per series — the
// cache stays warm across pairs.
export async function rankAllPairs(uid, opts) {
  const { seriesIds, from, to, maxLag = 14, method = 'pearson' } = opts;
  const cache = {};
  const fetched = {};
  for (const id of seriesIds) {
    try {
      fetched[id] = await fetchSeriesDaily(uid, id, from, to, cache);
    } catch { /* skip — series-specific failure shouldn't kill the scan */ }
  }
  const ids = Object.keys(fetched);
  const rows = [];
  const caloriesSeries = fetched['calories'];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const aId = ids[i];
      const bId = ids[j];
      // Skip pairs the math will trivially confirm — score derived from its
      // macro inputs, multiple symptoms reflecting a single underlying state,
      // macros co-recorded from one food log. Cross-domain (and weight ×
      // waist) is where the actual signal lives.
      if (isStructurallyTautological(aId, bId)) continue;
      if (shouldSkipWithinDomain(aId, bId)) continue;

      const seriesA = fetched[aId];
      const seriesB = fetched[bId];

      // Causal-direction prior: restrict the lag search range so we don't
      // surface findings implying a backwards causal chain (e.g., a symptom
      // "leading" a compound dose). See lagRangeForPair for the rules.
      const lagBounds = lagRangeForPair(aId, bId, maxLag);

      let best;
      let controls = [];
      if (shouldControlForCalories(aId, bId) && caloriesSeries
          && caloriesSeries.values?.size) {
        // Macro × something else: ask whether the macro adds explanatory
        // power beyond total calories. Falls back to plain pearson if the
        // partial-correlation overlap can't clear MIN_N_PARTIAL.
        best = bestLagByDatePartial(seriesA, seriesB, [caloriesSeries], { ...lagBounds, method });
        if (best) controls = ['calories'];
        else best = bestLagByDate(seriesA, seriesB, { ...lagBounds, method });
      } else {
        best = bestLagByDate(seriesA, seriesB, { ...lagBounds, method });
      }

      if (!best) continue;
      if (best.n < MIN_N_PAIRWISE) continue;
      if (Math.abs(best.r) < MIN_R_RELEVANT) continue;
      rows.push({
        a: aId, aLabel: seriesA.label,
        b: bId, bLabel: seriesB.label,
        r: best.r, lag: best.lag, n: best.n,
        method,
        controls,
        confidence: correlationConfidence(best.r, best.n),
      });
    }
  }
  rows.sort((x, y) => y.confidence - x.confidence);
  return { from, to, rankings: rows };
}

// Insights aggregator — casts a wide net across the user's full series
// catalog (not just the chart's active selection). Pair correlations are
// computed for every i<j combination; change-points are scanned across
// every series. Findings are merged, sorted by importance, and capped.
export async function insights(uid, opts = {}) {
  const today = opts.to || isoToday();
  const from = opts.from || shiftDay(today, -90); // default 90d window
  const allSeries = await listAvailableSeriesIds(uid);

  const findings = [];

  // 1. Pair correlations across all series.
  try {
    const ranked = await rankAllPairs(uid, {
      seriesIds: allSeries,
      from, to: today,
    });
    for (const row of ranked.rankings.slice(0, 6)) {
      findings.push(buildCorrelationFinding(row, from, today));
    }
  } catch { /* ignore — best-effort */ }

  // 2. Change-points across every series. Each series's strongest break
  // contributes one candidate finding; importance comes from `normalized`
  // so the global sort below picks the most pronounced shifts.
  // Pass through the caller's range so change-point detection respects the
  // same window as the correlation pass — otherwise the two surfaces
  // disagree on what counts as "recent."
  for (const id of allSeries) {
    try {
      const cp = await changePoints(uid, {
        series: id,
        from,
        to: today,
        respectWindow: true,
      });
      if (!cp.points?.length) continue;
      const top = cp.points.sort((a, b) => b.normalized - a.normalized)[0];
      if (top) findings.push(buildChangePointFinding(top, cp));
    } catch { /* ignore */ }
  }

  // 3. Goal projection — only meaningful where the user has a target.
  // Today only weight has a goal field; if other targets are added later
  // (waist goal, daily-cal target streak), broaden here.
  try {
    const settings = await UserSettings.findOne({ userId: uid })
      .select('goalWeightLbs').lean();
    const target = settings?.goalWeightLbs;
    if (target) {
      const proj = await project(uid, { series: 'weight', target });
      if (proj.targetReachedOn) findings.push(buildProjectionFinding(proj, target));
    }
  } catch { /* ignore */ }

  findings.sort((x, y) => (y.importance ?? 0) - (x.importance ?? 0));
  return {
    from, to: today,
    activeSeries: allSeries,
    findings: findings.slice(0, 8),
    computedAt: new Date().toISOString(),
  };
}

// ---- Finding builders ---------------------------------------------------

function buildCorrelationFinding(row, from, to) {
  // Phrasing is intentionally symmetric — correlation doesn't imply causation,
  // and in this domain effects can run either way (food → weight, but also
  // weight → joint pain; vomiting → weight loss). We just describe the
  // co-movement and, when there's a lag, which series moved first.
  //
  // Lag convention from bestLagByDate(seriesA, seriesB, ...):
  //   row.lag > 0 → A (row.a) leads B (row.b)
  //   row.lag < 0 → B (row.b) leads A (row.a)
  const aLabel = row.aLabel || row.a;
  const bLabel = row.bLabel || row.b;
  const positive = row.r > 0;

  let title;
  if (row.lag === 0) {
    title = positive
      ? `${aLabel} and ${bLabel} rise and fall together`
      : `${aLabel} rises as ${bLabel} falls`;
  } else {
    const k = Math.abs(row.lag);
    const leader = row.lag > 0 ? aLabel : bLabel;
    const lagger = row.lag > 0 ? bLabel : aLabel;
    title = positive
      ? `${leader} rises ~${k}d before ${lagger} rises`
      : `${leader} rises ~${k}d before ${lagger} falls`;
  }

  const explainPrompt = positive
    ? `Why might my ${aLabel.toLowerCase()} and ${bLabel.toLowerCase()} `
      + `move together like this? What in my routine could explain it?`
    : `Why might my ${aLabel.toLowerCase()} go up when my ${bLabel.toLowerCase()} `
      + `goes down (or vice versa)? What in my routine could explain it?`;

  const controlNote = row.controls?.length
    ? ` (controlling for ${row.controls.join(', ')})`
    : '';
  return {
    id: `corr:${row.a}:${row.b}:${row.lag}`,
    kind: 'correlation',
    title,
    claim: `r=${row.r.toFixed(2)}${controlNote} over ${row.n} matching days`,
    confidence: row.confidence,
    importance: row.confidence,
    evidence: {
      series: [row.a, row.b],
      range: { from, to },
      lag: row.lag,
      n: row.n,
      controls: row.controls || [],
    },
    explainPrompt,
  };
}

function buildChangePointFinding(top, cp) {
  const sign = top.afterSlope < top.beforeSlope ? 'accelerated' : 'slowed';
  return {
    id: `cp:${cp.series}:${top.date}`,
    kind: 'change-point',
    title: `${cp.label} trend ${sign} on ${top.date}`,
    claim:
      `Slope shifted from ${top.beforeSlope.toFixed(3)} to ${top.afterSlope.toFixed(3)} ${cp.unit}/day`,
    confidence: Math.min(1, top.normalized / 3),
    importance: Math.min(1, top.normalized / 3),
    evidence: {
      series: [cp.series],
      range: { from: cp.from, to: cp.to },
      changeDate: top.date,
      n: cp.n,
    },
    explainPrompt:
      `My ${cp.label.toLowerCase()} trend ${sign} around ${top.date}. `
      + `What changed in my routine around then?`,
  };
}

function buildProjectionFinding(proj, target) {
  return {
    id: `proj:${proj.series}:${target}`,
    kind: 'projection',
    title: `On track to reach ${target} ${proj.unit} on ${proj.targetReachedOn}`,
    claim: `Current rate ${proj.slope.toFixed(2)} ${proj.unit}/day over the last ${proj.n} days`,
    confidence: 0.6,
    importance: 0.6,
    evidence: {
      series: [proj.series],
      range: { from: shiftDay(proj.targetReachedOn, -proj.n), to: proj.targetReachedOn },
      n: proj.n,
    },
    explainPrompt:
      `When am I projected to hit my ${proj.label.toLowerCase()} goal at the current rate?`,
  };
}

function isoToday() {
  const now = new Date();
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('-');
}
