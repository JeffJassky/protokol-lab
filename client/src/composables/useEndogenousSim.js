// Server-side simulation client. Hits /api/sim/range with checkpoint
// caching server-side; this composable is just a fetch+state wrapper.
//
// The simulation itself runs in `server/src/sim/runner.js` against the
// user's logged events + subject settings. The server returns dense
// per-signal arrays at 15-min resolution, sampled across the requested
// window. Range invalidation lives in
// `server/src/sim/invalidationHooks.js` — log writes and subject
// edits clear the per-user checkpoint so the next request recomputes.
//
// API (preserved from the legacy worker version so callers don't break):
//   result          shallowRef<{ timestamps, series, mealCount, ... }>
//   busy            ref<boolean>
//   error           ref<string|null>
//   computeTimeMs   ref<number|null>
//   run({ from, to, signals })   — fires a fetch + populates result

import { ref, shallowRef } from 'vue';
import { api } from '../api/index.js';

export function useEndogenousSim() {
  const result = shallowRef({
    timestamps: [],
    series: {},
    mealCount: 0,
    exerciseCount: 0,
  });
  const busy = ref(false);
  const error = ref(null);
  const computeTimeMs = ref(null);
  let runToken = 0;
  let debounceTimer = null;
  // 200ms is enough to coalesce a burst of chip toggles ("add glucose,
  // then insulin, then GLP-1") into a single fetch while staying snappy
  // on a single deliberate change.
  const DEBOUNCE_MS = 200;

  async function actuallyRun({ from, to, signals }) {
    const myToken = ++runToken;
    busy.value = true;
    error.value = null;
    try {
      // Send the window as user-local-midnight ms-since-epoch. The
      // server used to accept YYYY-MM-DD and parse it as UTC midnight,
      // which shifted the response window by the user's UTC offset
      // (PT users got data from yesterday evening through this
      // afternoon, missing tonight). Sending raw ms keeps the
      // boundaries in the user's frame end-to-end.
      const fromMs = from instanceof Date
        ? from.getTime()
        : (typeof from === 'number' ? from : new Date(from).getTime());
      const toMs = to instanceof Date
        ? to.getTime()
        : (typeof to === 'number' ? to : new Date(to).getTime());
      const params = new URLSearchParams({
        fromMs: String(fromMs),
        toMs: String(toMs),
        signals: signals.join(','),
      });
      const data = await api.get(`/api/sim/range?${params}`);
      if (myToken !== runToken) return;
      result.value = {
        timestamps: data.timestamps || [],
        series: data.series || {},
        mealCount: data.mealCount || 0,
        exerciseCount: data.exerciseCount || 0,
        computeMs: data.computeMs,
        fromCheckpoint: !!data.fromCheckpoint,
        fromResponseCache: !!data.fromResponseCache,
      };
      computeTimeMs.value = data.computeMs;
    } catch (err) {
      if (myToken !== runToken) return;
      error.value = err?.message || 'Sim fetch failed';
      console.error('[endo-sim] fetch failed', err);
    } finally {
      if (myToken === runToken) busy.value = false;
    }
  }

  function run({ from, to, signals }) {
    if (!signals?.length) {
      result.value = { timestamps: [], series: {}, mealCount: 0, exerciseCount: 0 };
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      actuallyRun({ from, to, signals });
    }, DEBOUNCE_MS);
  }

  return { result, busy, error, computeTimeMs, run };
}
