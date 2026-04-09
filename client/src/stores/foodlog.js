import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

export const useFoodLogStore = defineStore('foodlog', () => {
  const entries = ref({ breakfast: [], lunch: [], dinner: [], snack: [] });
  const summary = ref(null);
  const currentDate = ref(new Date().toISOString().slice(0, 10));

  async function fetchLog(date) {
    currentDate.value = date;
    const data = await api.get(`/api/foodlog?date=${date}`);
    entries.value = data.entries;
  }

  async function fetchSummary(date) {
    const data = await api.get(`/api/foodlog/summary?date=${date}`);
    summary.value = data.summary;
  }

  async function loadDay(date) {
    currentDate.value = date;
    await Promise.all([fetchLog(date), fetchSummary(date)]);
  }

  async function updateEntry(id, payload) {
    await api.put(`/api/foodlog/${id}`, payload);
    await loadDay(currentDate.value);
  }

  async function deleteEntry(id) {
    await api.del(`/api/foodlog/${id}`);
    await loadDay(currentDate.value);
  }

  return { entries, summary, currentDate, fetchLog, fetchSummary, loadDay, updateEntry, deleteEntry };
});
