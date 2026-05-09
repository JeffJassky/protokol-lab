import { ref, shallowRef } from 'vue';
import { api } from '../api/index.js';

// Experimental: runs the @kyneticbio/core ODE solver in a worker against
// the user's food log to produce continuous endogenous-signal series
// (glucose, insulin, GLP-1, etc.). v1: food-only, default subject, no
// caching, snacks ignored. The simulation is continuous across the
// selected window — state is stitched between meals inside the worker.

// Recreate the worker on every run so a stale long-running sim from the
// previous toggle (or an HMR-leaked worker) gets terminated before we
// kick off a new one. Saves CPU and prevents the newest run from
// queueing behind orphaned compute.
let workerInstance = null;
function freshWorker() {
  if (workerInstance) {
    try { workerInstance.terminate(); } catch { /* ignore */ }
  }
  workerInstance = new Worker(
    new URL('../workers/endogenous.worker.js', import.meta.url),
    { type: 'module' },
  );
  workerInstance.onerror = (e) => {
    console.error('[endo-worker] uncaught', e.message, e);
  };
  workerInstance.onmessageerror = (e) => {
    console.error('[endo-worker] message decode error', e);
  };
  return workerInstance;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (workerInstance) {
      try { workerInstance.terminate(); } catch { /* ignore */ }
      workerInstance = null;
    }
  });
}

export function useEndogenousSim() {
  // shallowRef for the series payload — it's a record of { signal: number[] }
  // and a sibling number[] of timestamps. Deep reactivity would be wasteful
  // and triggers Chart.js re-renders we don't need.
  const result = shallowRef({ timestamps: [], series: {}, mealCount: 0 });
  const busy = ref(false);
  const error = ref(null);
  const computeTimeMs = ref(null);

  let runToken = 0;

  async function run({ from, to, signals, subject, conditions }) {
    if (!signals?.length) {
      result.value = { timestamps: [], series: {}, mealCount: 0 };
      return;
    }

    const myToken = ++runToken;
    busy.value = true;
    error.value = null;

    let meals = [];
    let exercises = [];
    try {
      const params = new URLSearchParams({ from, to });
      // Fetch both event streams in parallel — meals and exercises are
      // independent in storage but converge in the worker's per-day chunks.
      const [mealsData, exData] = await Promise.all([
        api.get(`/api/foodlog/range-meals?${params}`),
        api.get(`/api/exerciselog/range-events?${params}`),
      ]);
      meals = mealsData.meals || [];
      exercises = exData.events || [];
      console.debug('[endo-sim] fetched events', {
        from, to, signals, mealCount: meals.length, exerciseCount: exercises.length,
      });
    } catch (err) {
      console.error('[endo-sim] event fetch failed', err);
      if (myToken === runToken) {
        error.value = err.message || 'Failed to fetch events';
        busy.value = false;
      }
      return;
    }

    if (myToken !== runToken) return; // a newer call superseded this one

    const worker = freshWorker();
    await new Promise((resolve) => {
      const handler = (event) => {
        if (myToken !== runToken) {
          // Stale response — ignore. The newer call will install its own handler.
          worker.removeEventListener('message', handler);
          resolve();
          return;
        }
        worker.removeEventListener('message', handler);
        if (event.data?.error) {
          error.value = event.data.error;
        } else {
          result.value = event.data;
          computeTimeMs.value = event.data.computeTimeMs;
        }
        busy.value = false;
        resolve();
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ meals, exercises, signals, subject, conditions });
    });
  }

  return { result, busy, error, computeTimeMs, run };
}
