import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

export const useWeightStore = defineStore('weight', () => {
  const entries = ref([]);
  const stats = ref(null);
  const doses = ref([]);
  const pkCurve = ref([]);
  const waistEntries = ref([]);

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

  async function fetchDoses() {
    const data = await api.get('/api/doses');
    doses.value = data.entries;
  }

  async function fetchPkCurve(from, to) {
    const params = new URLSearchParams({ points: '150' });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api.get(`/api/doses/pk?${params}`);
    pkCurve.value = data.curve;
  }

  async function addDose(doseMg, date) {
    await api.post('/api/doses', { doseMg, date });
    await Promise.all([fetchDoses(), fetchPkCurve()]);
  }

  async function deleteDose(id) {
    await api.del(`/api/doses/${id}`);
    await Promise.all([fetchDoses(), fetchPkCurve()]);
  }

  async function fetchWaistEntries(from, to) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api.get(`/api/waist?${params}`);
    waistEntries.value = data.entries;
  }

  async function addWaist(waistInches, date) {
    await api.post('/api/waist', { waistInches, date });
    await fetchWaistEntries();
  }

  async function deleteWaist(id) {
    await api.del(`/api/waist/${id}`);
    await fetchWaistEntries();
  }

  return {
    entries, stats, doses, pkCurve, waistEntries,
    fetchEntries, fetchStats, addWeight, deleteWeight,
    fetchDoses, fetchPkCurve, addDose, deleteDose,
    fetchWaistEntries, addWaist, deleteWaist,
  };
});
