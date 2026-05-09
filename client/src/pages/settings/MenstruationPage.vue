<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';

const store = useSettingsStore();

// Local mirror of settings.menstruation. Same debounced-save pattern as
// the other settings sub-pages — local refs hydrate from the API on mount,
// any change schedules a patch back through the settings store.
const enabled = ref(false);
const lastPeriodStart = ref('');
const cycleLength = ref(28);
const lutealPhaseLength = ref(14);
const showOnLog = ref(true);
const showOnDashboard = ref(true);

const notifEnabled = ref(false);
const notifTime = ref('09:00');
const events = ref({
  periodExpected:    { enabled: true,  daysBefore: 1 },
  ovulationExpected: { enabled: false, daysBefore: 0 },
  fertileWindow:     { enabled: false, daysBefore: 0 },
  pmsWindow:         { enabled: false, daysBefore: 5 },
  latePeriod:        { enabled: false, daysAfter:  2 },
});

const hydrated = ref(false);

// Predicted dates derived from lastPeriodStart + cycleLength. Surfaced
// so the user can sanity-check that the predictions match their lived
// cycle before turning notifications on.
const predicted = computed(() => {
  if (!lastPeriodStart.value) return null;
  const start = new Date(lastPeriodStart.value);
  if (Number.isNaN(start.getTime())) return null;
  const cl = Math.max(15, Math.min(60, Number(cycleLength.value) || 28));
  const lp = Math.max(7, Math.min(20, Number(lutealPhaseLength.value) || 14));
  const ms = 86400000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Roll forward until the predicted next period is in the future. Also
  // valid for users who entered a date months ago and haven't refreshed.
  let nextPeriod = new Date(start.getTime() + cl * ms);
  while (nextPeriod < today) nextPeriod = new Date(nextPeriod.getTime() + cl * ms);
  const ovulation = new Date(nextPeriod.getTime() - lp * ms);
  const fertileStart = new Date(ovulation.getTime() - 5 * ms);
  const cycleStart = new Date(nextPeriod.getTime() - cl * ms);
  const cycleDay = Math.floor((today - cycleStart) / ms) + 1;
  return { nextPeriod, ovulation, fertileStart, cycleDay, cycleLength: cl };
});

function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const NOTIFICATION_DEFS = [
  {
    key: 'periodExpected',
    label: 'Period expected',
    desc: 'Heads-up the day before your predicted period.',
    offsetField: 'daysBefore',
    offsetLabel: 'days before',
  },
  {
    key: 'ovulationExpected',
    label: 'Ovulation day',
    desc: 'Predicted ovulation, based on your luteal phase length.',
    offsetField: 'daysBefore',
    offsetLabel: 'days before',
  },
  {
    key: 'fertileWindow',
    label: 'Fertile window opens',
    desc: '5 days before predicted ovulation.',
    offsetField: 'daysBefore',
    offsetLabel: 'days before',
  },
  {
    key: 'pmsWindow',
    label: 'PMS window',
    desc: 'A few days before your period — for symptom-tracking nudges.',
    offsetField: 'daysBefore',
    offsetLabel: 'days before',
  },
  {
    key: 'latePeriod',
    label: 'Period is late',
    desc: 'If your predicted period is past due by N days.',
    offsetField: 'daysAfter',
    offsetLabel: 'days late',
  },
];

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  const m = store.settings?.menstruation || {};
  enabled.value = Boolean(m.enabled);
  lastPeriodStart.value = m.lastPeriodStart ? String(m.lastPeriodStart).slice(0, 10) : '';
  cycleLength.value = m.cycleLength ?? 28;
  lutealPhaseLength.value = m.lutealPhaseLength ?? 14;
  showOnLog.value = m.showOnLog !== false;
  showOnDashboard.value = m.showOnDashboard !== false;
  const n = m.notifications || {};
  notifEnabled.value = Boolean(n.enabled);
  notifTime.value = n.time || '09:00';
  for (const def of NOTIFICATION_DEFS) {
    const e = n[def.key];
    if (e) events.value[def.key] = {
      enabled: Boolean(e.enabled),
      [def.offsetField]: Number(e[def.offsetField]) || 0,
    };
  }
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
    menstruation: {
      enabled: enabled.value,
      lastPeriodStart: lastPeriodStart.value || null,
      cycleLength: Number(cycleLength.value) || 28,
      lutealPhaseLength: Number(lutealPhaseLength.value) || 14,
      showOnLog: showOnLog.value,
      showOnDashboard: showOnDashboard.value,
      notifications: {
        enabled: notifEnabled.value,
        time: notifTime.value,
        ...events.value,
      },
    },
  });
}

watch(
  [enabled, lastPeriodStart, cycleLength, lutealPhaseLength,
   showOnLog, showOnDashboard, notifEnabled, notifTime, events],
  scheduleSave,
  { deep: true },
);
</script>

<template>
  <div class="menstruation-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">
        ‹ Profile
      </router-link>
      <h2 class="page-title">Menstrual cycle</h2>
    </div>

    <div class="card callout">
      Your cycle data also feeds the simulation engine on the Dashboard.
      When enabled, estrogen, progesterone, LH, and FSH curves shift
      across your cycle instead of staying flat at the default-day baseline.
    </div>

    <div class="card">
      <label class="row toggle-row">
        <span class="toggle-label">
          <span class="toggle-name">Enable cycle tracking</span>
          <span class="toggle-sub">
            Track period dates, get predictions + optional reminders.
          </span>
        </span>
        <input type="checkbox" v-model="enabled" />
      </label>
    </div>

    <template v-if="enabled">
      <div class="card">
        <h3>Cycle</h3>
        <div class="grid">
          <label class="field">
            <span class="field-label">Last period start</span>
            <input type="date" v-model="lastPeriodStart" class="field-input" />
          </label>
          <label class="field">
            <span class="field-label">Cycle length</span>
            <span class="field-input-wrap">
              <input
                type="number"
                v-model.number="cycleLength"
                min="15"
                max="60"
                step="1"
                class="field-input"
              />
              <span class="field-unit">days</span>
            </span>
          </label>
          <label class="field">
            <span class="field-label">Luteal phase</span>
            <span class="field-input-wrap">
              <input
                type="number"
                v-model.number="lutealPhaseLength"
                min="7"
                max="20"
                step="1"
                class="field-input"
              />
              <span class="field-unit">days</span>
            </span>
          </label>
        </div>

        <div v-if="predicted" class="predict-grid">
          <div class="predict-cell">
            <span class="predict-label">Cycle day</span>
            <span class="predict-value">{{ predicted.cycleDay }} / {{ predicted.cycleLength }}</span>
          </div>
          <div class="predict-cell">
            <span class="predict-label">Next period</span>
            <span class="predict-value">{{ fmtDate(predicted.nextPeriod) }}</span>
          </div>
          <div class="predict-cell">
            <span class="predict-label">Predicted ovulation</span>
            <span class="predict-value">{{ fmtDate(predicted.ovulation) }}</span>
          </div>
          <div class="predict-cell">
            <span class="predict-label">Fertile window</span>
            <span class="predict-value">{{ fmtDate(predicted.fertileStart) }} →</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Display</h3>
        <label class="row checkbox-row">
          <input type="checkbox" v-model="showOnLog" />
          <span>Show cycle day on Log page</span>
        </label>
        <label class="row checkbox-row">
          <input type="checkbox" v-model="showOnDashboard" />
          <span>Show cycle hormones on Dashboard charts</span>
        </label>
      </div>

      <div class="card">
        <h3>Reminders</h3>
        <label class="row toggle-row">
          <span class="toggle-label">
            <span class="toggle-name">Enable reminders</span>
            <span class="toggle-sub">Push notifications at the times below.</span>
          </span>
          <input type="checkbox" v-model="notifEnabled" />
        </label>

        <template v-if="notifEnabled">
          <label class="row">
            <span class="field-label">Send at</span>
            <input type="time" v-model="notifTime" class="field-input wide" />
          </label>

          <div class="event-list">
            <div
              v-for="def in NOTIFICATION_DEFS"
              :key="def.key"
              class="event-row"
            >
              <label class="event-toggle">
                <input
                  type="checkbox"
                  v-model="events[def.key].enabled"
                />
                <span class="event-text">
                  <span class="event-name">{{ def.label }}</span>
                  <span class="event-desc">{{ def.desc }}</span>
                </span>
              </label>
              <span v-if="events[def.key].enabled" class="event-offset">
                <input
                  type="number"
                  :value="events[def.key][def.offsetField]"
                  @input="events[def.key][def.offsetField] = Number($event.target.value)"
                  min="0"
                  max="14"
                  step="1"
                  class="field-input narrow"
                />
                <span class="field-unit">{{ def.offsetLabel }}</span>
              </span>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.menstruation-page { max-width: 720px; }
.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.back-link {
  text-decoration: none;
  color: var(--text-tertiary);
  font-size: var(--font-size-s);
}
.back-link:hover { color: var(--text); }
.page-title {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin: 0;
}
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
.callout {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.5;
  border-left: 2px solid var(--primary);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}
.row + .row { border-top: 1px solid var(--border); }
.toggle-row { align-items: flex-start; }
.toggle-label { display: flex; flex-direction: column; gap: 2px; }
.toggle-name {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  color: var(--text);
}
.toggle-sub {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.checkbox-row {
  justify-content: flex-start;
  border-top: none;
  padding: var(--space-1) 0;
  gap: var(--space-2);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
@media (max-width: 540px) {
  .grid { grid-template-columns: 1fr; }
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  background: var(--bg);
  border: 1px solid var(--border);
}
.field:focus-within { border-color: var(--primary); }
.field-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.field-input-wrap { display: flex; align-items: baseline; gap: var(--space-1); }
.field-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}
.field-input.wide { width: 120px; flex: none; padding: 4px 8px; border: 1px solid var(--border); }
.field-input.narrow { width: 56px; flex: none; padding: 4px 8px; border: 1px solid var(--border); text-align: right; }
.field-unit {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-medium);
}

.predict-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}
@media (max-width: 540px) {
  .predict-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.predict-cell { display: flex; flex-direction: column; gap: 2px; }
.predict-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.predict-value {
  font-size: var(--font-size-s);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.event-list {
  display: flex;
  flex-direction: column;
  margin-top: var(--space-3);
}
.event-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border);
}
.event-row:first-child { border-top: none; }
.event-toggle {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  flex: 1;
  cursor: pointer;
}
.event-text { display: flex; flex-direction: column; gap: 2px; }
.event-name {
  font-size: var(--font-size-s);
  color: var(--text);
  font-weight: var(--font-weight-medium);
}
.event-desc {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.event-offset { display: inline-flex; align-items: baseline; gap: var(--space-1); }
</style>
