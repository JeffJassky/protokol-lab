import { defineStore } from 'pinia';
import { ref } from 'vue';
import { fetchInsights } from '../api/analysis.js';

// Caches the last `insights` response and de-duplicates concurrent fetches
// so the dashboard's reactive watchers (active series, range) don't fire
// overlapping requests.
export const useInsightsStore = defineStore('insights', () => {
  const findings = ref([]);
  const window = ref({ from: null, to: null });
  const computedAt = ref(null);
  const loading = ref(false);
  const error = ref(null);
  let inflight = null;
  let lastKey = '';

  function makeKey({ from, to }) {
    return `${from || ''}|${to || ''}`;
  }

  async function load(opts = {}) {
    const key = makeKey(opts);
    if (key === lastKey && findings.value.length) return findings.value;
    if (inflight) {
      try { await inflight; } catch { /* swallow — error already surfaced via .error */ }
      if (key === lastKey) return findings.value;
    }
    loading.value = true;
    error.value = null;
    inflight = (async () => {
      try {
        const result = await fetchInsights(opts);
        findings.value = Array.isArray(result?.findings) ? result.findings : [];
        window.value = { from: result?.from || null, to: result?.to || null };
        computedAt.value = result?.computedAt || null;
        lastKey = key;
      } catch (e) {
        error.value = e.message || 'Could not load insights.';
        findings.value = [];
      } finally {
        loading.value = false;
        inflight = null;
      }
    })();
    await inflight;
    return findings.value;
  }

  function clear() {
    findings.value = [];
    window.value = { from: null, to: null };
    computedAt.value = null;
    error.value = null;
    lastKey = '';
  }

  return { findings, window, computedAt, loading, error, load, clear };
});
