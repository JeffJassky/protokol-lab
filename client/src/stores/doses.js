import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';

export const useDosesStore = defineStore('doses', () => {
  // Flat, newest-first across all compounds. UI groups as needed.
  const entries = ref([]);
  // PK curves keyed by compoundId.
  const curvesByCompound = ref({});

  const entriesByCompound = computed(() => {
    const out = {};
    for (const e of entries.value) {
      const k = e.compoundId;
      if (!out[k]) out[k] = [];
      out[k].push(e);
    }
    return out;
  });

  async function fetchEntries() {
    const data = await api.get('/api/doses');
    entries.value = data.entries;
  }

  async function fetchPkCurves(from, to) {
    const params = new URLSearchParams({ points: '150' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api.get(`/api/doses/pk?${params}`);
    const map = {};
    for (const c of data.curves) map[c.compoundId] = c;
    curvesByCompound.value = map;
  }

  async function addDose({ compoundId, value, date }) {
    await api.post('/api/doses', { compoundId, value, date });
    await Promise.all([fetchEntries(), fetchPkCurves()]);
  }

  async function deleteDose(id) {
    await api.del(`/api/doses/${id}`);
    await Promise.all([fetchEntries(), fetchPkCurves()]);
  }

  function todaysDoseFor(compoundId, dateStr) {
    return entries.value.find(
      (e) => e.compoundId === compoundId && String(e.date).slice(0, 10) === dateStr,
    );
  }

  function latestDoseFor(compoundId) {
    return entries.value
      .filter((e) => e.compoundId === compoundId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  }

  return {
    entries,
    curvesByCompound,
    entriesByCompound,
    fetchEntries,
    fetchPkCurves,
    addDose,
    deleteDose,
    todaysDoseFor,
    latestDoseFor,
  };
});
