import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';
import { localYmd } from '../utils/date.js';

// Exercise log entries. Day-scoped fetch for the LogPage card; date-range
// fetch for the dashboard "burned" / "net calories" series. Stays
// intentionally lightweight — no per-entry persistence so a cold start
// always reflects server truth.
export const useExerciseLogStore = defineStore('exerciselog', () => {
  const entriesByDay = ref(new Map()); // YYYY-MM-DD → ExerciseLog[]
  const dailyBurn = ref([]); // [{ date, caloriesBurned, durationMin, count }]
  const currentDate = ref(localYmd());

  async function fetchDay(date) {
    currentDate.value = date;
    const params = new URLSearchParams({ from: date, to: date });
    const data = await api.get(`/api/exerciselog?${params}`);
    entriesByDay.value = new Map(entriesByDay.value);
    entriesByDay.value.set(date, data.entries || []);
  }

  async function fetchRangeBurn(from, to) {
    const params = new URLSearchParams({ from, to });
    const data = await api.get(`/api/exerciselog/daily?${params}`);
    dailyBurn.value = data.days || [];
  }

  async function create(payload) {
    const data = await api.post('/api/exerciselog', payload);
    // Refresh whichever day the entry landed on.
    const day = (payload.date || new Date().toISOString()).slice(0, 10);
    await fetchDay(day);
    return data.entry;
  }

  async function update(id, payload) {
    const data = await api.put(`/api/exerciselog/${id}`, payload);
    await fetchDay(currentDate.value);
    return data.entry;
  }

  async function remove(id) {
    await api.del(`/api/exerciselog/${id}`);
    await fetchDay(currentDate.value);
  }

  function entriesFor(date) {
    return entriesByDay.value.get(date) || [];
  }

  return {
    entriesByDay, dailyBurn, currentDate,
    fetchDay, fetchRangeBurn, create, update, remove, entriesFor,
  };
});
