<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';
import { useFastingStore } from '../../stores/fasting.js';
import {
  FASTING_PROTOCOLS,
  protocolDurationMinutes,
  formatDuration,
} from '../../../../shared/fasting.js';

const store = useSettingsStore();
const fasting = useFastingStore();

// Local mirror of settings.fasting — debounced patches to the API on change.
const enabled = ref(false);
const showOnLog = ref(true);
const showOnDashboard = ref(true);
const kind = ref('daily');
const protocol = ref('16:8');
const fastDurationMinutes = ref(16 * 60);
const dailyStartTime = ref('20:00');
const weeklyRules = ref([]); // [{ weekday, startTime, durationMinutes }]
const hydrated = ref(false);

// One-off fast composer.
const oneOffStartDate = ref('');
const oneOffStartTime = ref('20:00');
const oneOffDurationHours = ref(24);
const oneOffNotes = ref('');
const oneOffError = ref('');
const oneOffSaving = ref(false);

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const eatHoursLabel = computed(() => {
  const fast = fastDurationMinutes.value / 60;
  const eat = Math.max(0, 24 - fast);
  return `${eat}h eating window`;
});

function selectProtocol(value) {
  protocol.value = value;
  const dur = protocolDurationMinutes(value);
  if (dur) fastDurationMinutes.value = dur;
}

function toggleWeekday(value) {
  const idx = weeklyRules.value.findIndex((r) => r.weekday === value);
  if (idx === -1) {
    weeklyRules.value.push({
      weekday: value,
      startTime: dailyStartTime.value,
      durationMinutes: fastDurationMinutes.value,
    });
    weeklyRules.value.sort((a, b) => a.weekday - b.weekday);
  } else {
    weeklyRules.value.splice(idx, 1);
  }
}

function isWeekdayActive(value) {
  return weeklyRules.value.some((r) => r.weekday === value);
}

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  if (!fasting.loaded) await fasting.fetchEvents();
  const f = store.settings?.fasting || {};
  enabled.value = Boolean(f.enabled);
  showOnLog.value = f.showOnLog !== false;
  showOnDashboard.value = f.showOnDashboard !== false;
  kind.value = f.kind || 'daily';
  protocol.value = f.protocol || '16:8';
  fastDurationMinutes.value = f.fastDurationMinutes || 16 * 60;
  dailyStartTime.value = f.dailyStartTime || '20:00';
  weeklyRules.value = Array.isArray(f.weeklyRules) ? [...f.weeklyRules] : [];

  // Sensible default for the one-off composer: today's date.
  const today = new Date();
  oneOffStartDate.value = today.toISOString().slice(0, 10);
  hydrated.value = true;
});

let saveTimer = null;
function scheduleSave() {
  if (!hydrated.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 500);
}

async function persist() {
  await store.patchSettings({
    fasting: {
      enabled: enabled.value,
      showOnLog: showOnLog.value,
      showOnDashboard: showOnDashboard.value,
      kind: kind.value,
      protocol: protocol.value,
      fastDurationMinutes: fastDurationMinutes.value,
      dailyStartTime: dailyStartTime.value,
      weeklyRules: weeklyRules.value,
      ianaTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
}

watch(
  [
    enabled, showOnLog, showOnDashboard, kind, protocol,
    fastDurationMinutes, dailyStartTime, weeklyRules,
  ],
  scheduleSave,
  { deep: true },
);

async function createOneOff() {
  oneOffError.value = '';
  oneOffSaving.value = true;
  try {
    const startISO = new Date(`${oneOffStartDate.value}T${oneOffStartTime.value}`).toISOString();
    const startDate = new Date(startISO);
    const endDate = new Date(startDate.getTime() + Number(oneOffDurationHours.value) * 60 * 60 * 1000);
    await fasting.createOneOff({
      plannedStartAt: startISO,
      plannedEndAt: endDate.toISOString(),
      notes: oneOffNotes.value,
    });
    oneOffNotes.value = '';
  } catch (err) {
    oneOffError.value = err.message;
  } finally {
    oneOffSaving.value = false;
  }
}

const upcomingOneOffs = computed(() =>
  (fasting.events || [])
    .filter((e) => e.source === 'one_off' && !e.actualStartAt)
    .sort((a, b) => new Date(a.plannedStartAt) - new Date(b.plannedStartAt)),
);

function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

async function deleteOneOff(id) {
  if (!confirm('Cancel this one-off fast?')) return;
  await fasting.deleteEvent(id);
}
</script>

<template>
  <div class="fasting-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">
        ‹ Profile
      </router-link>
      <h2 class="page-title">Fasting</h2>
    </div>

    <div class="card">
      <label class="row toggle-row">
        <span class="toggle-label">
          <span class="toggle-name">Enable fasting</span>
          <span class="toggle-sub">Track fasting + eating windows.</span>
        </span>
        <input type="checkbox" v-model="enabled" />
      </label>
    </div>

    <template v-if="enabled">
      <div class="card">
        <h3>Display</h3>
        <label class="row checkbox-row">
          <input type="checkbox" v-model="showOnLog" />
          <span>Show banner on Log page</span>
        </label>
        <label class="row checkbox-row">
          <input type="checkbox" v-model="showOnDashboard" />
          <span>Show banner on Dashboard</span>
        </label>
      </div>

      <div class="card">
        <h3>Schedule</h3>
        <div class="kind-tabs">
          <button
            type="button"
            class="kind-tab"
            :class="{ active: kind === 'daily' }"
            @click="kind = 'daily'"
          >
            Daily
          </button>
          <button
            type="button"
            class="kind-tab"
            :class="{ active: kind === 'weekly' }"
            @click="kind = 'weekly'"
          >
            By weekday
          </button>
          <button
            type="button"
            class="kind-tab"
            :class="{ active: kind === 'none' }"
            @click="kind = 'none'"
          >
            Off
          </button>
        </div>

        <template v-if="kind !== 'none'">
          <div class="protocol-row">
            <button
              v-for="p in FASTING_PROTOCOLS"
              :key="p.value"
              type="button"
              class="protocol-chip"
              :class="{ active: protocol === p.value }"
              @click="selectProtocol(p.value)"
            >
              {{ p.label }}
            </button>
          </div>

          <div class="schedule-grid">
            <label class="bio-group">
              <span class="bio-label">Fast starts at</span>
              <input type="time" v-model="dailyStartTime" class="bio-input wide" />
            </label>
            <label class="bio-group">
              <span class="bio-label">Fast duration</span>
              <input
                type="number"
                v-model.number="fastDurationMinutes"
                step="15"
                min="60"
                max="4320"
                class="bio-input wide"
              />
              <span class="bio-unit">min ({{ formatDuration(fastDurationMinutes) }})</span>
            </label>
          </div>
          <p class="hint">{{ eatHoursLabel }}</p>
        </template>

        <template v-if="kind === 'weekly'">
          <div class="weekday-row">
            <button
              v-for="d in WEEKDAYS"
              :key="d.value"
              type="button"
              class="weekday-chip"
              :class="{ active: isWeekdayActive(d.value) }"
              @click="toggleWeekday(d.value)"
            >
              {{ d.label }}
            </button>
          </div>
          <p class="hint">
            Tap each day you want to fast. Each day uses the start time and
            duration above.
          </p>
        </template>
      </div>

      <div class="card">
        <h3>One-off fast</h3>
        <p class="hint">
          Schedule a single non-recurring fast (e.g. extended 24h+).
        </p>
        <div class="oneoff-grid">
          <label class="bio-group">
            <span class="bio-label">Date</span>
            <input type="date" v-model="oneOffStartDate" class="bio-input wide" />
          </label>
          <label class="bio-group">
            <span class="bio-label">Start time</span>
            <input type="time" v-model="oneOffStartTime" class="bio-input wide" />
          </label>
          <label class="bio-group">
            <span class="bio-label">Duration (hours)</span>
            <input
              type="number"
              v-model.number="oneOffDurationHours"
              min="1"
              max="72"
              step="0.5"
              class="bio-input wide"
            />
          </label>
        </div>
        <input
          type="text"
          v-model="oneOffNotes"
          placeholder="Notes (optional)"
          class="oneoff-notes"
        />
        <div class="oneoff-actions">
          <button
            type="button"
            class="btn-primary"
            :disabled="oneOffSaving || !oneOffStartDate"
            @click="createOneOff"
          >
            {{ oneOffSaving ? 'Saving…' : 'Schedule fast' }}
          </button>
          <span v-if="oneOffError" class="error">{{ oneOffError }}</span>
        </div>

        <div v-if="upcomingOneOffs.length" class="oneoff-list">
          <div class="oneoff-list-label">Upcoming</div>
          <div
            v-for="ev in upcomingOneOffs"
            :key="ev._id"
            class="oneoff-row"
          >
            <div class="oneoff-row-text">
              <span class="oneoff-row-when">
                {{ fmtDateTime(ev.plannedStartAt) }} →
                {{ fmtDateTime(ev.plannedEndAt) }}
              </span>
              <span v-if="ev.notes" class="oneoff-row-note">{{ ev.notes }}</span>
            </div>
            <button
              type="button"
              class="oneoff-delete"
              @click="deleteOneOff(ev._id)"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.fasting-page { max-width: 560px; }
.head {
  padding: var(--space-5) var(--space-5) 0;
  margin-bottom: var(--space-4);
}
.back-link {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  text-decoration: none;
  margin-bottom: var(--space-2);
  padding: var(--space-1) 0;
}
.back-link:hover { color: var(--text); }
.page-title { margin: 0; text-align: center; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}
.card h3 {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin: 0 0 var(--space-3);
}

.row { display: flex; align-items: center; gap: var(--space-2); }
.toggle-row { justify-content: space-between; }
.toggle-label { display: flex; flex-direction: column; gap: 2px; }
.toggle-name { font-size: var(--font-size-m); font-weight: var(--font-weight-medium); color: var(--text); }
.toggle-sub { font-size: var(--font-size-xs); color: var(--text-tertiary); }

.checkbox-row + .checkbox-row { margin-top: var(--space-2); }
.checkbox-row span { font-size: var(--font-size-s); color: var(--text); }
.checkbox-row input { accent-color: var(--primary); }

.kind-tabs {
  display: inline-flex;
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 2px;
  gap: 2px;
  margin-bottom: var(--space-3);
}
.kind-tab {
  padding: 0.35rem 0.85rem;
  background: none;
  border: none;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
}
.kind-tab.active {
  background: var(--surface-raised);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}

.protocol-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}
.protocol-chip {
  padding: 0.35rem 0.75rem;
  font-size: var(--font-size-s);
  background: var(--bg);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.protocol-chip.active {
  background: var(--primary);
  color: var(--text-on-primary);
  border-color: var(--primary);
  font-weight: var(--font-weight-bold);
}

.schedule-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
}
@media (max-width: 480px) {
  .schedule-grid { grid-template-columns: 1fr; }
}
.bio-group { display: flex; flex-direction: column; gap: var(--space-1); }
.bio-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.bio-input {
  padding: 0.4rem 0.55rem;
  font-size: var(--font-size-s);
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  font-variant-numeric: tabular-nums;
}
.bio-input.wide { width: 100%; }
.bio-unit { font-size: var(--font-size-xs); color: var(--text-tertiary); }
.hint { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: var(--space-2) 0 0; }

.weekday-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-3);
}
.weekday-chip {
  padding: 0.4rem 0.7rem;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  background: var(--bg);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  cursor: pointer;
}
.weekday-chip.active {
  background: var(--primary);
  color: var(--text-on-primary);
  border-color: var(--primary);
}

.oneoff-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
@media (max-width: 480px) {
  .oneoff-grid { grid-template-columns: 1fr; }
}
.oneoff-notes {
  width: 100%;
  padding: 0.4rem 0.55rem;
  font-size: var(--font-size-s);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  margin-bottom: var(--space-3);
}
.oneoff-actions { display: flex; align-items: center; gap: var(--space-3); }

.oneoff-list { margin-top: var(--space-4); }
.oneoff-list-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--space-2);
}
.oneoff-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
}
.oneoff-row + .oneoff-row { margin-top: var(--space-2); }
.oneoff-row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.oneoff-row-when { font-size: var(--font-size-s); color: var(--text); font-variant-numeric: tabular-nums; }
.oneoff-row-note { font-size: var(--font-size-xs); color: var(--text-tertiary); }
.oneoff-delete {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: var(--font-size-m);
  cursor: pointer;
  padding: 0 var(--space-2);
}
.oneoff-delete:hover { color: var(--danger); }

.error { color: var(--danger); font-size: var(--font-size-s); }
</style>
