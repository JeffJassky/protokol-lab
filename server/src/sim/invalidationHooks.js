// Re-export of checkpoint invalidation primitives so route handlers
// import them from one consistent path. Wrap them in fire-and-forget
// helpers so a hook failure never breaks the underlying mutation.

import {
  invalidateCheckpoint,
  maybeInvalidateCheckpoint,
} from './checkpoint.js';
import { clearCachedResponses } from './responseCache.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('sim-invalidate');

// Fire-and-forget. We never want a checkpoint-invalidation failure to
// take down a log-write request. Worst case: stale cache for one read,
// next write fixes it.
export function invalidateAsync(userId, reason) {
  // Drop the in-memory response cache synchronously — it's just a Map
  // delete and we want the next request to definitely see fresh data.
  clearCachedResponses(userId);
  invalidateCheckpoint(userId).catch((err) => {
    log.warn({ userId: String(userId), reason, err: String(err?.message || err) }, 'invalidate failed');
  });
}

export function maybeInvalidateAsync(userId, affectedDate, reason) {
  // For partial invalidations (a single old log-day write that's pre-
  // checkpoint), we still need to nuke any cached series response that
  // covers that day. Cheap to drop the whole user's cache here — the
  // next read recomputes.
  clearCachedResponses(userId);
  maybeInvalidateCheckpoint(userId, affectedDate).catch((err) => {
    log.warn({ userId: String(userId), reason, err: String(err?.message || err) }, 'maybe-invalidate failed');
  });
}
