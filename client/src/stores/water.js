import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';

// Conversion helpers for the volume dimension. Storage canonical = ml; display
// uses the user's `settings.water.unit` preference.
export const ML_PER_FL_OZ = 29.5735;
export function mlToUnit(ml, unit) {
  if (!Number.isFinite(ml)) return 0;
  return unit === 'fl_oz' ? ml / ML_PER_FL_OZ : ml;
}
export function unitToMl(value, unit) {
  if (!Number.isFinite(value)) return 0;
  return unit === 'fl_oz' ? value * ML_PER_FL_OZ : value;
}

export const useWaterStore = defineStore('water', () => {
  const entriesByDate = ref(new Map());

  function dayKey(date) {
    if (date instanceof Date) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(date);
  }

  async function fetchDay(date) {
    const key = dayKey(date);
    const data = await api.get(`/api/water?date=${encodeURIComponent(key)}`);
    entriesByDate.value.set(key, data.entries || []);
    return data.entries || [];
  }

  function entriesFor(date) {
    return entriesByDate.value.get(dayKey(date)) || [];
  }

  function totalMlFor(date) {
    return entriesFor(date).reduce((sum, e) => sum + (e.volumeMl || 0), 0);
  }

  async function addEntry(volumeMl, date) {
    const key = dayKey(date);
    await api.post('/api/water', { volumeMl, date: key });
    await fetchDay(key);
  }

  async function deleteEntry(id, date) {
    await api.del(`/api/water/${id}`);
    await fetchDay(date);
  }

  // Remove the most recent entry for the day — used by drop-tap to decrement.
  async function popLatest(date) {
    const list = entriesFor(date);
    if (!list.length) return;
    const latest = list[0];
    await deleteEntry(latest._id, date);
  }

  async function fetchDailyTotals(from, to) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api.get(`/api/water/daily-totals?${params}`);
    return data.days || [];
  }

  return {
    entriesByDate,
    fetchDay,
    entriesFor,
    totalMlFor,
    addEntry,
    deleteEntry,
    popLatest,
    fetchDailyTotals,
  };
});
