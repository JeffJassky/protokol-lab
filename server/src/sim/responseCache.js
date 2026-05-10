// Per-user single-entry sim cache.
//
// The engine simulates state day-by-day with carryover; running for
// May 10 already integrates through every prior day in the window. The
// previous "key by request range" cache tossed those intermediate
// samples and re-ran from scratch when the user asked for May 9.
//
// This cache holds the FULL simulated window per user (timestamps +
// SIGNALS_ALL series). A request slices its visible portion. The
// cache widens monotonically: a request for days outside the cached
// window triggers a re-run with the union of (cached window, request
// window), capped at the rolling MAX_CACHE_DAYS_BACK to keep memory
// bounded.
//
// Mutations clear the entry via invalidationHooks.

const _byUser = new Map(); // userId → { fromMs, toMs, timestamps, series }

// Cap the cached window to ~3 months of history. Beyond that the
// chart use cases are rare; if a user explicitly requests further
// back, we expand on demand for that request, but trim the cache to
// MAX_CACHE_DAYS_BACK afterwards.
const DAY_MS = 86_400_000;
export const MAX_CACHE_DAYS_BACK = 90;

export function getCachedEntry(userId) {
  return _byUser.get(String(userId)) || null;
}

// Replace the user's cache entry. `fromMs` / `toMs` are the half-open
// bounds covered by the timestamps array.
export function setCachedEntry(userId, entry) {
  _byUser.set(String(userId), entry);
}

// Slice [reqFromMs, reqToMs) out of a cached payload. Returns null if
// the cache doesn't fully cover the request — the caller then runs
// the sim to widen.
export function sliceFromCache(entry, reqFromMs, reqToMs) {
  if (!entry) return null;
  if (reqFromMs < entry.fromMs) return null;
  if (reqToMs > entry.toMs) return null;
  const ts = entry.timestamps;
  const sliceTs = [];
  // Mirror SIGNALS_ALL in the cached series; build matching empty
  // arrays here without depending on the catalog.
  const sliceSeries = {};
  for (const k of Object.keys(entry.series)) sliceSeries[k] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (t < reqFromMs || t >= reqToMs) continue;
    sliceTs.push(t);
    for (const k of Object.keys(entry.series)) {
      sliceSeries[k].push(entry.series[k][i]);
    }
  }
  return { timestamps: sliceTs, series: sliceSeries };
}

export function clearCachedResponses(userId) {
  _byUser.delete(String(userId));
}

// Test / dev helper.
export function _peekCacheSize(userId) {
  const e = _byUser.get(String(userId));
  return e ? e.timestamps.length : 0;
}

export { DAY_MS as _DAY_MS };
