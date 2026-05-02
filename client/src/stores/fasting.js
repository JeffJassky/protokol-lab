import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';
import { computeFastingStatus } from '../../../shared/fasting.js';
import { useSettingsStore } from './settings.js';

// Holds the last-fetched fasting events (active + upcoming + recent history)
// and exposes a reactive status object derived from settings + events + a
// 1-minute "tick" so the banner re-renders without a backend round-trip.
//
// Server is authoritative for state transitions (start / end / one-off
// create). The 1-minute tick only re-evaluates the local clock against
// already-known events.
export const useFastingStore = defineStore('fasting', () => {
  const events = ref([]);
  const loaded = ref(false);
  const tick = ref(Date.now());

  let tickHandle = null;

  // Drive the banner: minute resolution is plenty. Started lazily so the
  // store doesn't burn a setInterval before anything subscribes.
  function startTicking() {
    if (tickHandle) return;
    tickHandle = setInterval(() => {
      tick.value = Date.now();
    }, 60 * 1000);
  }
  function stopTicking() {
    if (!tickHandle) return;
    clearInterval(tickHandle);
    tickHandle = null;
  }

  async function fetchEvents() {
    const data = await api.get('/api/fasting');
    events.value = data.events || [];
    loaded.value = true;
  }

  async function startManual(durationMinutes) {
    const data = await api.post('/api/fasting/start', { durationMinutes });
    upsertEvent(data.event);
  }

  async function endNow() {
    const data = await api.post('/api/fasting/end');
    upsertEvent(data.event);
  }

  async function createOneOff({ plannedStartAt, plannedEndAt, notes }) {
    const data = await api.post('/api/fasting/one-off', {
      plannedStartAt,
      plannedEndAt,
      notes,
    });
    upsertEvent(data.event);
  }

  async function editEvent(id, patch) {
    const data = await api.patch(`/api/fasting/${id}`, patch);
    upsertEvent(data.event);
  }

  async function deleteEvent(id) {
    await api.del(`/api/fasting/${id}`);
    events.value = events.value.filter((e) => e._id !== id);
  }

  function upsertEvent(event) {
    if (!event) return;
    const idx = events.value.findIndex((e) => e._id === event._id);
    if (idx === -1) events.value.push(event);
    else events.value.splice(idx, 1, event);
  }

  // Banner-ready status. Re-runs whenever settings, events, or `tick` change.
  const status = computed(() => {
    // Touch tick so reactivity tracks the minute timer.
    tick.value; // eslint-disable-line no-unused-expressions
    const settings = useSettingsStore();
    const schedule = settings.settings?.fasting;
    return computeFastingStatus(schedule, events.value, new Date());
  });

  return {
    events,
    loaded,
    status,
    fetchEvents,
    startManual,
    endNow,
    createOneOff,
    editEvent,
    deleteEvent,
    startTicking,
    stopTicking,
  };
});
