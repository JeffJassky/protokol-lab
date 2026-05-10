// Server-side endogenous-signal sim endpoint with checkpoint caching.
// Returns the same shape the client worker used to produce —
// { timestamps, series, computeMs } — so the chart layer doesn't change.
//
// Caching strategy (Option B from plan):
//   - UserSettings.latestSimCheckpoint stores end-of-day SimulationState
//     for some date D. Subsequent requests for windows starting after D
//     resume from cp.endState instead of re-simulating from t=0.
//   - Window starts before D, or D is older than MAX_FORWARD_WINDOW
//     days back: full rerun from t=0 through the window.
//   - Invalidation lives in src/sim/invalidationHooks.js — log writes
//     and subject mutations clear the checkpoint when needed.
//   - Per-userId in-memory mutex (withSimMutex) dedupes concurrent
//     cache-miss recomputes within a single Node process.
//
// Endpoints:
//   GET /api/sim/range?from=YYYY-MM-DD&to=YYYY-MM-DD&signals=glucose,insulin
//   GET /api/sim/day?date=YYYY-MM-DD&signals=glucose,insulin

import { Router } from 'express';
import { SIGNALS_ALL } from '@kyneticbio/core';
import { runForUser } from '../sim/runner.js';
import { loadCheckpoint, advanceCheckpoint, withSimMutex } from '../sim/checkpoint.js';
import {
  getCachedEntry,
  setCachedEntry,
  sliceFromCache,
  MAX_CACHE_DAYS_BACK,
} from '../sim/responseCache.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('sim');
const router = Router();

// If the checkpoint is more than this many days behind the requested
// window's start, fall back to full rerun rather than simulating
// forward through that many gap days. 60 days is a guess; tune after
// measuring real workloads.
const MAX_FORWARD_WINDOW_DAYS = 60;

const DAY_MS = 86_400_000;

function parseSignalList(input) {
  if (!input || typeof input !== 'string') return [];
  return input.split(',').map((s) => s.trim()).filter(Boolean);
}

// Resolve a window boundary from query params. Prefers `*Ms` (raw ms
// since epoch — user-local-midnight passed straight through from the
// browser, which is the only way to honor the user's timezone end-to-
// end). Falls back to a YYYY-MM-DD string parsed as UTC midnight for
// legacy callers; that path is wrong for non-UTC users but kept so
// the agent / curl-debug paths still work.
function parseBoundary(msRaw, dateRaw) {
  if (msRaw != null && msRaw !== '') {
    const n = Number(msRaw);
    if (Number.isFinite(n)) return n;
  }
  if (typeof dateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    const [y, mo, d] = dateRaw.split('-').map(Number);
    return Date.UTC(y, mo - 1, d, 0, 0);
  }
  if (dateRaw) {
    const t = new Date(dateRaw).getTime();
    if (Number.isFinite(t)) return t;
  }
  return null;
}

// Core "run + maybe-cache" logic shared by /range and /day.
//
// Per-user single-entry cache (`responseCache.js`) holds the FULL
// SIGNALS_ALL series for whatever window has been simulated. Because
// the engine integrates state day-by-day with carryover, computing
// May 10 ALSO computes May 9 / 8 / 7 / ... — there's no extra cost
// to emit those samples and stash them.
//
// Read path:
//   1. Look up the user's cache entry. If [reqFrom, reqTo) ⊂ [cFrom, cTo),
//      slice and return — zero engine work.
//   2. Otherwise compute the union window — covers both the cached
//      range (so we don't lose what we had) and the new request — and
//      run the sim once. Replace cache.
//
// The cached window grows monotonically up to MAX_CACHE_DAYS_BACK so
// memory stays bounded even after a year of distinct queries.
async function runWithCache({ userId, signals, responseFromMs, responseToMs }) {
  const cached = getCachedEntry(userId);
  const slice = sliceFromCache(cached, responseFromMs, responseToMs);
  if (slice) {
    return shapeResponse({ ...cached, ...slice }, signals, true);
  }

  return withSimMutex(userId, async () => {
    // Re-check inside the mutex — peer request may have warmed the cache.
    const cached2 = getCachedEntry(userId);
    const slice2 = sliceFromCache(cached2, responseFromMs, responseToMs);
    if (slice2) return shapeResponse({ ...cached2, ...slice2 }, signals, true);

    // Cache target: a rolling 90-day window ending at the latest
    // requested-or-cached timestamp. Anchored to `today - 90d`
    // independent of the request — first run for May 8 still simulates
    // & caches Feb..May 8, so the next request for May 7 hits cache.
    const cacheFloor = Date.now() - MAX_CACHE_DAYS_BACK * DAY_MS;
    const cachedTo = cached2 ? cached2.toMs : -Infinity;
    const cacheToTarget = Math.max(cachedTo, responseToMs);

    // Sim run window: when the user explicitly requests data older than
    // the cache floor, run wider so they get their answer; we still
    // only RETAIN the floor-onward portion in cache.
    const simViewFromMs = Math.min(cacheFloor, responseFromMs);
    const simViewToMs = cacheToTarget;

    const cp = await loadCheckpoint(userId);
    let simFromMs;
    let initialState;
    let fromCheckpoint = false;

    if (cp) {
      const cpDateMs = cp.date.getTime();
      const gapDays = Math.floor((simViewFromMs - cpDateMs) / DAY_MS);
      if (cpDateMs < simViewFromMs && gapDays <= MAX_FORWARD_WINDOW_DAYS) {
        simFromMs = cpDateMs + DAY_MS;
        initialState = cp.endState;
        fromCheckpoint = true;
      }
    }
    if (simFromMs == null) {
      simFromMs = 0;
      initialState = undefined;
    }

    const result = await runForUser({
      userId,
      signals: SIGNALS_ALL,
      fromMs: simFromMs,
      toMs: simViewToMs,
      viewFromMs: simViewFromMs,
      viewToMs: simViewToMs,
      initialState,
    });

    // Cache: trim to [cacheFloor, cacheToTarget]. Anything older than
    // the floor is discarded so memory stays bounded; the user still
    // got their response from the wider run.
    const cacheEntryFromMs = Math.max(cacheFloor, simViewFromMs);
    const cacheTimestamps = [];
    const cacheSeries = Object.fromEntries(SIGNALS_ALL.map((k) => [k, []]));
    for (let i = 0; i < result.timestamps.length; i++) {
      const ts = result.timestamps[i];
      if (ts < cacheEntryFromMs || ts >= cacheToTarget) continue;
      cacheTimestamps.push(ts);
      for (const k of SIGNALS_ALL) cacheSeries[k].push(result.series[k][i]);
    }

    if (result.finalState != null) {
      const requestedEndDay = cacheToTarget - DAY_MS;
      const newCpDate = new Date(
        result.finalDayMs != null
          ? Math.max(result.finalDayMs, requestedEndDay)
          : requestedEndDay,
      );
      await advanceCheckpoint(userId, {
        date: newCpDate,
        endState: result.finalState,
        inputsThroughDate: newCpDate,
      });
    }

    const fullEntry = {
      fromMs: cacheEntryFromMs,
      toMs: cacheToTarget,
      timestamps: cacheTimestamps,
      series: cacheSeries,
      computeMs: result.computeMs,
      loadMs: result.loadMs,
      mealCount: result.mealCount,
      exerciseCount: result.exerciseCount,
      fromCheckpoint,
    };
    setCachedEntry(userId, fullEntry);

    // Build the response slice from the FULL run — the user's request
    // may include pre-floor data that didn't make it into the cache.
    const respTimestamps = [];
    const respSeries = Object.fromEntries(SIGNALS_ALL.map((k) => [k, []]));
    for (let i = 0; i < result.timestamps.length; i++) {
      const ts = result.timestamps[i];
      if (ts < responseFromMs || ts >= responseToMs) continue;
      respTimestamps.push(ts);
      for (const k of SIGNALS_ALL) respSeries[k].push(result.series[k][i]);
    }
    return shapeResponse(
      { ...fullEntry, timestamps: respTimestamps, series: respSeries },
      signals,
      false,
    );
  });
}

// Pick the requested signals out of an all-signals payload. `fromCache`
// distinguishes a no-engine-work hit from a fresh compute.
function shapeResponse(payload, signals, fromCache) {
  const out = {
    timestamps: payload.timestamps,
    series: {},
    computeMs: fromCache ? 0 : payload.computeMs,
    loadMs: fromCache ? 0 : payload.loadMs,
    mealCount: payload.mealCount,
    exerciseCount: payload.exerciseCount,
    fromCheckpoint: payload.fromCheckpoint,
    fromResponseCache: fromCache,
  };
  for (const k of signals) {
    if (payload.series[k]) out.series[k] = payload.series[k];
  }
  return out;
}

router.get('/range', async (req, res) => {
  const rlog = req.log || log;
  const fromMs = parseBoundary(req.query.fromMs, req.query.from);
  const toMs = parseBoundary(req.query.toMs, req.query.to);
  if (fromMs == null || toMs == null) {
    return res.status(400).json({ error: 'fromMs and toMs (or from/to YYYY-MM-DD) required' });
  }
  if (toMs < fromMs) {
    return res.status(400).json({ error: 'to must be >= from' });
  }
  const signals = parseSignalList(req.query.signals);
  // When the caller already supplied an explicit `toMs` it represents
  // the actual end-of-window in real time (e.g. user-local "now").
  // The legacy YYYY-MM-DD path hands back UTC-midnight, so we still
  // pad by a day to include the requested last day.
  const responseToMs = req.query.toMs != null ? toMs : toMs + DAY_MS;

  try {
    const out = await runWithCache({
      userId: req.userId,
      signals,
      responseFromMs: fromMs,
      responseToMs,
    });
    res.json(out);
  } catch (err) {
    rlog.error({ err: String(err?.stack || err) }, 'sim/range failed');
    res.status(500).json({ error: 'sim run failed' });
  }
});

router.get('/day', async (req, res) => {
  const rlog = req.log || log;
  const dayMs = parseBoundary(req.query.dayMs, req.query.date);
  if (dayMs == null) {
    return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  }
  const signals = parseSignalList(req.query.signals);

  try {
    const out = await runWithCache({
      userId: req.userId,
      signals,
      responseFromMs: dayMs,
      responseToMs: dayMs + DAY_MS,
    });
    res.json({ date: req.query.date, ...out });
  } catch (err) {
    rlog.error({ err: String(err?.stack || err) }, 'sim/day failed');
    res.status(500).json({ error: 'sim run failed' });
  }
});

export default router;
