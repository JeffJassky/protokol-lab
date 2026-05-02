import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

export const useWeightStore = defineStore('weight', () => {
  const entries = ref([]);
  const stats = ref(null);

  async function fetchEntries(from, to) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api.get(`/api/weight?${params}`);
    entries.value = data.entries;
  }

  async function fetchStats() {
    const data = await api.get('/api/weight/stats');
    stats.value = data.stats;
  }

  async function addWeight(weightLbs, date) {
    await api.post('/api/weight', { weightLbs, date });
    await Promise.all([fetchEntries(), fetchStats()]);
  }

  async function deleteWeight(id) {
    await api.del(`/api/weight/${id}`);
    await Promise.all([fetchEntries(), fetchStats()]);
  }

  return {
    entries, stats,
    fetchEntries, fetchStats, addWeight, deleteWeight,
  };
});
