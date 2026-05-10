<script setup>
import { ref, onMounted, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';

const store = useSettingsStore();

const enabled = ref(false);
const showOnLog = ref(true);
const showOnDashboard = ref(true);
const energyMode = ref('baseline');
const hydrated = ref(false);

const ENERGY_MODES = [
  {
    key: 'baseline',
    label: 'Burned calories do not get added to daily budget',
    badge: 'Default',
    desc: 'Your TDEE multiplier already covers typical workouts. Logged exercise shows burn for awareness; calorie target stays put.',
    bestWhen: 'Activity level on your profile reflects your real lifestyle.',
  },
  {
    key: 'earn',
    label: 'Burned calories get added to daily budget',
    desc: 'Set TDEE to sedentary on your profile; each workout adds calories to today\'s target. Exercise "earns" food.',
    bestWhen: 'You want logging to feel direct — no compounding multipliers.',
  },
];

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  const e = store.settings?.exercise || {};
  enabled.value = Boolean(e.enabled);
  showOnLog.value = e.showOnLog !== false;
  showOnDashboard.value = e.showOnDashboard !== false;
  // Legacy 'hidden' values persist on existing accounts but are no
  // longer user-selectable — fall back to baseline so the radio group
  // shows a valid selection.
  energyMode.value = ['baseline', 'earn'].includes(e.energyMode) ? e.energyMode : 'baseline';
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
    exercise: {
      enabled: enabled.value,
      showOnLog: showOnLog.value,
      showOnDashboard: showOnDashboard.value,
      energyMode: energyMode.value,
    },
  });
}

watch([enabled, showOnLog, showOnDashboard, energyMode], scheduleSave);
</script>

<template>
  <div class="exercise-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">
        ‹ Profile
      </router-link>
      <h2 class="page-title">Exercise</h2>
    </div>

    <div class="card">
      <label class="row toggle-row">
        <span class="toggle-label">
          <span class="toggle-name">Enable exercise tracking</span>
          <span class="toggle-sub">Log workouts on the Log page; surface burn on the Dashboard.</span>
        </span>
        <input type="checkbox" v-model="enabled" />
      </label>
    </div>

    <template v-if="enabled">
      <div class="card">
        <h3>Display</h3>
        <label class="row checkbox-row">
          <input type="checkbox" v-model="showOnLog" />
          <span>Show exercise card on Log page</span>
        </label>
        <label class="row checkbox-row">
          <input type="checkbox" v-model="showOnDashboard" />
          <span>Show burn / net calories on Dashboard</span>
        </label>
      </div>

      <div class="card">
        <h3>Energy mode</h3>
        <p class="card-blurb">
          How should logged exercise interact with your calorie math?
          The right choice depends on how you set your TDEE on the
          Profile page.
        </p>

        <label
          v-for="mode in ENERGY_MODES"
          :key="mode.key"
          class="mode"
          :class="{ active: energyMode === mode.key }"
        >
          <input
            type="radio"
            name="energy-mode"
            :value="mode.key"
            v-model="energyMode"
          />
          <div class="mode-body">
            <div class="mode-head">
              <span class="mode-label">{{ mode.label }}</span>
              <span v-if="mode.badge" class="mode-badge">{{ mode.badge }}</span>
            </div>
            <div class="mode-desc">{{ mode.desc }}</div>
            <div class="mode-best">
              <strong>Best when:</strong> {{ mode.bestWhen }}
            </div>
          </div>
        </label>
      </div>

      <router-link to="/profile/settings/exercises" class="card settings-link">
        <span class="settings-link-text">
          <span class="settings-link-label">Exercise catalog</span>
          <span class="settings-link-sub">Enable / disable activities, add custom entries</span>
        </span>
        <span class="settings-link-chevron">›</span>
      </router-link>
    </template>
  </div>
</template>

<style scoped>
.exercise-page { max-width: 720px; }
.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.back-link { text-decoration: none; color: var(--text-tertiary); font-size: var(--font-size-s); }
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
.card-blurb {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  line-height: 1.5;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}
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
  padding: var(--space-1) 0;
  gap: var(--space-2);
}

.mode {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  margin-bottom: var(--space-2);
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.mode:hover { border-color: var(--text-tertiary); }
.mode.active { border-color: var(--primary); background: var(--primary-soft); }
.mode input { margin-top: 4px; }
.mode-body { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.mode-head { display: flex; align-items: baseline; gap: var(--space-2); }
.mode-label {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  color: var(--text);
}
.mode-badge {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--primary);
  font-weight: var(--font-weight-bold);
}
.mode-desc {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  line-height: 1.5;
}
.mode-best {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.settings-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  text-decoration: none;
  color: var(--text);
  margin-bottom: 2px;
  transition: border-color var(--transition-fast);
}
.settings-link:hover { border-color: var(--primary); }
.settings-link-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.settings-link-label {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  color: var(--text);
}
.settings-link-sub {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.settings-link-chevron {
  font-size: var(--font-size-l);
  color: var(--text-tertiary);
  flex: none;
}
</style>
