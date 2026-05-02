import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

// Mirrors the symptoms store shape. `logsByMetric` is keyed by metric id and
// holds the canonical-unit value for the currently-loaded date; conversion to
// the user's display unit happens at the component layer via shared/units.js.
export const useMetricsStore = defineStore('metrics', () => {
  const metrics = ref([]);
  const rangeLogs = ref([]);
  const logsByMetric = ref({});
  const currentDate = ref(null);
  const loading = ref(false);

  async function fetchMetrics() {
    const data = await api.get('/api/metrics');
    metrics.value = data.metrics;
  }

  async function createMetric({ name, dimension, displayUnit }) {
    const data = await api.post('/api/metrics', { name, dimension, displayUnit });
    metrics.value = [...metrics.value, data.metric];
    return data.metric;
  }

  async function updateMetric(id, patch) {
    const data = await api.patch(`/api/metrics/${id}`, patch);
    metrics.value = metrics.value.map((m) => (m._id === id ? data.metric : m));
    return data.metric;
  }

  async function deleteMetric(id) {
    await api.del(`/api/metrics/${id}`);
    metrics.value = metrics.value.filter((m) => m._id !== id);
    const next = { ...logsByMetric.value };
    delete next[id];
    logsByMetric.value = next;
  }

  async function reorder(ids) {
    await api.put('/api/metrics/reorder', { ids });
    const order = new Map(ids.map((id, i) => [id, i]));
    metrics.value = [...metrics.value].sort(
      (a, b) => (order.get(a._id) ?? a.order) - (order.get(b._id) ?? b.order),
    );
  }

  async function fetchLogsForDate(date) {
    loading.value = true;
    try {
      const data = await api.get(`/api/metrics/logs?date=${date}`);
      currentDate.value = date;
      const map = {};
      for (const log of data.logs) {
        map[log.metricId] = { _id: log._id, value: log.value };
      }
      logsByMetric.value = map;
    } finally {
      loading.value = false;
    }
  }

  async function setValue(metricId, value) {
    const date = currentDate.value;
    if (!date) return;
    const payload = { metricId, date, value };
    if (value == null || value === '') {
      await api.put('/api/metrics/logs', payload);
      const next = { ...logsByMetric.value };
      delete next[metricId];
      logsByMetric.value = next;
      return;
    }
    const data = await api.put('/api/metrics/logs', payload);
    logsByMetric.value = {
      ...logsByMetric.value,
      [metricId]: { _id: data.log._id, value: data.log.value },
    };
  }

  function getValue(metricId) {
    const log = logsByMetric.value[metricId];
    return log ? log.value : null;
  }

  async function fetchRangeLogs(from, to) {
    const params = new URLSearchParams({ from, to });
    const data = await api.get(`/api/metrics/logs/range?${params}`);
    rangeLogs.value = data.logs;
  }

  return {
    metrics,
    logsByMetric,
    rangeLogs,
    currentDate,
    loading,
    fetchMetrics,
    createMetric,
    updateMetric,
    deleteMetric,
    reorder,
    fetchLogsForDate,
    fetchRangeLogs,
    setValue,
    getValue,
  };
});
