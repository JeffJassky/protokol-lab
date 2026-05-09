import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';

// Sparse store of explicit DayStatus rows. Most days have no row;
// callers compose this with the auto-classification rule (a day with
// FoodLog entries → tracked; zero entries → untracked) to derive the
// effective disposition.
//
// The 7-day rolling budget is the primary consumer today. Future
// surfaces (supplement adherence views, exercise streaks) read the
// same store — see docs/tracked-untracked-days.md.
export const useDayStatusStore = defineStore('dayStatus', () => {
  // Date (YYYY-MM-DD) → row.
  const byDate = ref(new Map());

  const rows = computed(() => [...byDate.value.values()]);

  async function fetchRange(from, to) {
    const params = new URLSearchParams({ from, to });
    const data = await api.get(`/api/day-status?${params}`);
    const next = new Map(byDate.value);
    for (const row of data.rows || []) next.set(row.date, row);
    byDate.value = next;
  }

  function getStatus(date) {
    return byDate.value.get(date) || null;
  }

  // Upsert. The server path (`PUT /api/day-status`) is idempotent so
  // calling this twice with the same date just rewrites the row.
  async function setStatus(date, { status, reason, notes }) {
    const data = await api.put('/api/day-status', { date, status, reason, notes });
    const next = new Map(byDate.value);
    next.set(date, data.row);
    byDate.value = next;
    return data.row;
  }

  // Remove an explicit row → revert to auto-classification.
  async function clearStatus(date) {
    await api.del(`/api/day-status/${date}`);
    if (byDate.value.has(date)) {
      const next = new Map(byDate.value);
      next.delete(date);
      byDate.value = next;
    }
  }

  return { byDate, rows, fetchRange, getStatus, setStatus, clearStatus };
});
