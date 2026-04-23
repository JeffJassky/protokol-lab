import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

export const useFoodLogStore = defineStore('foodlog', () => {
  const entries = ref({ breakfast: [], lunch: [], dinner: [], snack: [] });
  const summary = ref(null);
  const currentDate = ref(new Date().toISOString().slice(0, 10));
  const dailyCalories = ref([]);
  const dailyNutrition = ref([]);

  async function fetchDailyCalories(from, to) {
    const params = new URLSearchParams({ from, to });
    const data = await api.get(`/api/foodlog/daily-calories?${params}`);
    dailyCalories.value = data.days;
  }

  async function fetchDailyNutrition(from, to) {
    const params = new URLSearchParams({ from, to });
    const data = await api.get(`/api/foodlog/daily-nutrition?${params}`);
    dailyNutrition.value = data.days;
    // Keep dailyCalories in sync so existing consumers still work.
    dailyCalories.value = data.days;
  }

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

  async function toggleConsumed(id, consumed) {
    await api.put(`/api/foodlog/${id}`, { consumed });
    await loadDay(currentDate.value);
  }

  async function deleteEntry(id) {
    await api.del(`/api/foodlog/${id}`);
    await loadDay(currentDate.value);
  }

  async function copyEntries(entryIds, dates) {
    await api.post('/api/foodlog/copy', { entryIds, dates });
    // Reload only if the currently-viewed date was in the target set, so the
    // user sees the copies appear immediately.
    if (dates.includes(currentDate.value)) await loadDay(currentDate.value);
  }

  async function moveEntries(entryIds, dates) {
    await api.post('/api/foodlog/move', { entryIds, dates });
    // Sources are gone, so always reload the current day. If the current day
    // also happens to be a target, the moved copies will show up too.
    await loadDay(currentDate.value);
  }

  return {
    entries,
    summary,
    currentDate,
    dailyCalories,
    dailyNutrition,
    fetchLog,
    fetchSummary,
    fetchDailyCalories,
    fetchDailyNutrition,
    loadDay,
    updateEntry,
    toggleConsumed,
    deleteEntry,
    copyEntries,
    moveEntries,
  };
});
