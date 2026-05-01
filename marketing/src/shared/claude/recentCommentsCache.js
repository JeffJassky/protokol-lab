// In-process per-day cache for the operator's recent reddit comments.
// Keyed by handle + ISO date (UTC). Entry from a prior calendar day is
// dropped on the next read. Process restart wipes the cache; a single
// fresh fetch on first call after restart is fine.
//
// Why per-day: comments don't change minute-to-minute, but if we go an
// entire day editing reddit replies we want a stable canonical voice
// signal that the model can rely on. Calendar-day rollover gives a
// natural refresh point without any explicit invalidation.

const cache = new Map();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getCachedRecentComments(handle) {
  const key = `${handle}:${todayKey()}`;
  const entry = cache.get(key);
  return entry ? entry.comments : null;
}

export function setCachedRecentComments(handle, comments) {
  const today = todayKey();
  const key = `${handle}:${today}`;
  cache.set(key, { comments, fetchedAt: Date.now() });
  // GC: drop entries from prior days. Cheap — handle count is small.
  for (const k of cache.keys()) {
    if (!k.endsWith(`:${today}`)) cache.delete(k);
  }
}

export function clearRecentCommentsCache() {
  cache.clear();
}
