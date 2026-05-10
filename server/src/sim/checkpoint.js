// PK/PD sim cache. Stores the most recent end-of-day SimulationState per
// user so `/api/sim/*` can resume forward instead of recomputing from
// t=0 every request. See models/UserSettings.js for the persisted shape.
//
// Bump CHECKPOINT_SCHEMA_VERSION when @kyneticbio/core changes the
// SimulationState shape in a way that would silently corrupt cached
// vectors (new compartment, removed signal, renamed key, etc.). The
// runner is forgiving about missing keys but a renamed compartment with
// same key but different semantics is the silent failure mode this
// guards against.
//
// Concurrency: in-memory mutex (per-userId) to dedupe full-history
// reruns when two requests for the same user race a cache miss. The
// loser awaits the winner's result. Mutex is in-process only — multi-
// instance deployments will still race across instances. Acceptable
// (worst case: redundant compute, no corruption since both compute the
// same answer).

import UserSettings from '../models/UserSettings.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('sim-checkpoint');

export const CHECKPOINT_SCHEMA_VERSION = 1;

// Read checkpoint. Returns null if missing, schema-mismatched, or
// structurally invalid (defensive: corrupt cache shouldn't take down
// the route, just force a recompute).
export async function loadCheckpoint(userId) {
  const settings = await UserSettings.findOne({ userId })
    .select('latestSimCheckpoint')
    .lean();
  const cp = settings?.latestSimCheckpoint;
  if (!cp || !cp.date || !cp.endState) return null;
  if (cp.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    log.debug(
      { userId: String(userId), stored: cp.schemaVersion, current: CHECKPOINT_SCHEMA_VERSION },
      'checkpoint: schema mismatch — treating as missing',
    );
    return null;
  }
  return {
    date: cp.date,
    endState: cp.endState,
    computedAt: cp.computedAt,
    inputsThroughDate: cp.inputsThroughDate,
  };
}

// Persist a new checkpoint. Always overwrites whatever was there — the
// caller (route) decides whether the new state is valid. Atomic upsert
// so concurrent writes don't lose data; last-write-wins is fine because
// every concurrent computation produces the same state for the same
// inputs.
export async function advanceCheckpoint(userId, { date, endState, inputsThroughDate }) {
  await UserSettings.updateOne(
    { userId },
    {
      $set: {
        'latestSimCheckpoint.date': date,
        'latestSimCheckpoint.endState': endState,
        'latestSimCheckpoint.computedAt': new Date(),
        'latestSimCheckpoint.schemaVersion': CHECKPOINT_SCHEMA_VERSION,
        'latestSimCheckpoint.inputsThroughDate': inputsThroughDate || date,
      },
      $setOnInsert: { userId },
    },
    { upsert: true },
  );
}

// Full nuke. Used when subject mutates or a custom food/compound edit
// makes historical sim outputs unreliable.
export async function invalidateCheckpoint(userId) {
  await UserSettings.updateOne(
    { userId },
    {
      $set: {
        'latestSimCheckpoint.date': null,
        'latestSimCheckpoint.endState': null,
        'latestSimCheckpoint.computedAt': null,
        'latestSimCheckpoint.schemaVersion': 0,
        'latestSimCheckpoint.inputsThroughDate': null,
      },
    },
  );
}

// Conditional nuke: only invalidate if the affected date is at-or-before
// the checkpoint date. Writes after the checkpoint don't disturb it —
// they'll be picked up on the next forward-from-checkpoint sim run.
//
// `affectedDate` may be a Date or an ms-since-epoch number.
export async function maybeInvalidateCheckpoint(userId, affectedDate) {
  if (!affectedDate) return;
  const affMs = affectedDate instanceof Date ? affectedDate.getTime() : Number(affectedDate);
  if (!Number.isFinite(affMs)) return;
  const cp = await loadCheckpoint(userId);
  if (!cp) return;
  if (affMs <= cp.date.getTime()) {
    log.debug(
      { userId: String(userId), affectedAt: new Date(affMs).toISOString(), cpAt: cp.date.toISOString() },
      'checkpoint: invalidating — write at-or-before cached date',
    );
    await invalidateCheckpoint(userId);
  }
}

// Per-userId mutex map. Dedupes concurrent cache-miss recomputes within
// a single Node process. Each entry is the in-flight Promise; followers
// await it instead of starting their own run.
const _runMutex = new Map();

export async function withSimMutex(userId, fn) {
  const key = String(userId);
  const existing = _runMutex.get(key);
  if (existing) return existing;
  const p = (async () => {
    try { return await fn(); }
    finally { _runMutex.delete(key); }
  })();
  _runMutex.set(key, p);
  return p;
}
