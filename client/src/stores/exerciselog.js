import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';
import { localYmd, shiftYmd } from '../utils/date.js';

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
    // Server filters by UTC-midnight bounds, but a log timestamp from
    // late evening local time falls on the next UTC day (or early-AM
    // entries fall on the previous UTC day). Widen the request window
    // by ±1 day and filter to entries whose local calendar day matches.
    const params = new URLSearchParams({
      from: shiftYmd(date, -1),
      to: shiftYmd(date, 1),
    });
    const data = await api.get(`/api/exerciselog?${params}`);
    const filtered = (data.entries || []).filter(
      (e) => localYmd(new Date(e.date)) === date,
    );
    entriesByDay.value = new Map(entriesByDay.value);
    entriesByDay.value.set(date, filtered);
  }

  async function fetchRangeBurn(from, to) {
    // Fetch per-event entries with full timestamps and group by LOCAL
    // calendar day. The server's /daily endpoint groups by UTC slice,
    // which loses late-evening local entries to the next UTC day —
    // earn-mode budget bumps then never appear for those days.
    // Widen the window by ±1 day to absorb tz drift on either edge,
    // then filter to the requested range after grouping.
    const params = new URLSearchParams({
      from: shiftYmd(from, -1),
      to: shiftYmd(to, 1),
    });
    const data = await api.get(`/api/exerciselog/range-events?${params}`);
    const events = data.events || [];
    const byDay = new Map();
    for (const ev of events) {
      const day = localYmd(new Date(ev.timestamp));
      if (day < from || day > to) continue;
      const acc = byDay.get(day)
        || { date: day, caloriesBurned: 0, durationMin: 0, count: 0 };
      acc.caloriesBurned += Number(ev.caloriesBurned) || 0;
      acc.durationMin += Number(ev.durationMin) || 0;
      acc.count += 1;
      byDay.set(day, acc);
    }
    dailyBurn.value = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async function create(payload) {
    const data = await api.post('/api/exerciselog', payload);
    // Refresh whichever LOCAL day the entry landed on. The naive
    // `payload.date.slice(0,10)` reads UTC and a 7pm-local entry that
    // crosses to next-day UTC would refresh the wrong day, leaving the
    // log card stale until the user refreshes the page.
    const ts = payload.date ? new Date(payload.date) : new Date();
    const day = localYmd(ts);
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
