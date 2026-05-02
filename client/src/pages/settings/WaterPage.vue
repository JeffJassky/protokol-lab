<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';
import { mlToUnit, unitToMl, ML_PER_FL_OZ } from '../../stores/water.js';

const store = useSettingsStore();

const enabled = ref(false);
const unit = ref('fl_oz');
const dailyTargetMl = ref(2000);
const servingMl = ref(250);
const showOnDashboard = ref(false);
const hydrated = ref(false);

// User edits in their preferred unit; we round-trip through ml on save.
const dailyTargetDisplay = computed({
  get() {
    const v = mlToUnit(dailyTargetMl.value, unit.value);
    return Math.round(v * 10) / 10;
  },
  set(v) {
    dailyTargetMl.value = Math.round(unitToMl(Number(v) || 0, unit.value));
  },
});
const servingDisplay = computed({
  get() {
    const v = mlToUnit(servingMl.value, unit.value);
    return Math.round(v * 10) / 10;
  },
  set(v) {
    servingMl.value = Math.round(unitToMl(Number(v) || 0, unit.value));
  },
});

const dropCount = computed(() => {
  if (!servingMl.value) return 0;
  return Math.max(1, Math.ceil(dailyTargetMl.value / servingMl.value));
});

const unitLabel = computed(() => (unit.value === 'fl_oz' ? 'fl oz' : 'ml'));

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  const w = store.settings?.water || {};
  enabled.value = Boolean(w.enabled);
  unit.value = w.unit || 'fl_oz';
  dailyTargetMl.value = Number.isFinite(w.dailyTargetMl) ? w.dailyTargetMl : 2000;
  servingMl.value = Number.isFinite(w.servingMl) ? w.servingMl : 250;
  showOnDashboard.value = Boolean(w.showOnDashboard);
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
    water: {
      enabled: enabled.value,
      unit: unit.value,
      dailyTargetMl: dailyTargetMl.value,
      servingMl: servingMl.value,
      showOnDashboard: showOnDashboard.value,
    },
  });
}

watch(
  [enabled, unit, dailyTargetMl, servingMl, showOnDashboard],
  scheduleSave,
);

function setPresetServing(ml) {
  servingMl.value = ml;
}
</script>

<template>
  <div class="water-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">
        ‹ Profile
      </router-link>
      <h2 class="page-title">Hydration</h2>
    </div>

    <div class="card">
      <label class="row toggle-row">
        <span class="toggle-label">
          <span class="toggle-name">Enable water tracking</span>
          <span class="toggle-sub">Show a tappable drop row on the Log page.</span>
        </span>
        <input type="checkbox" v-model="enabled" />
      </label>
    </div>

    <template v-if="enabled">
      <div class="card">
        <h3>Units</h3>
        <div class="unit-tabs">
          <button
            type="button"
            class="unit-tab"
            :class="{ active: unit === 'fl_oz' }"
            @click="unit = 'fl_oz'"
          >
            fl oz
          </button>
          <button
            type="button"
            class="unit-tab"
            :class="{ active: unit === 'ml' }"
            @click="unit = 'ml'"
          >
            ml
          </button>
        </div>
      </div>

      <div class="card">
        <h3>Daily goal</h3>
        <label class="bio-group">
          <span class="bio-label">Target per day</span>
          <div class="input-row">
            <input
              type="number"
              v-model.number="dailyTargetDisplay"
              min="1"
              step="1"
              class="bio-input"
            />
            <span class="bio-unit">{{ unitLabel }}</span>
          </div>
        </label>
      </div>

      <div class="card">
        <h3>Serving size</h3>
        <p class="hint">Each tap on a drop logs one serving.</p>
        <div class="preset-row">
          <button
            type="button"
            class="preset-chip"
            :class="{ active: servingMl === 240 }"
            @click="setPresetServing(240)"
          >
            8 fl oz
          </button>
          <button
            type="button"
            class="preset-chip"
            :class="{ active: servingMl === 500 }"
            @click="setPresetServing(500)"
          >
            500 ml
          </button>
          <button
            type="button"
            class="preset-chip"
            :class="{ active: servingMl === 250 }"
            @click="setPresetServing(250)"
          >
            250 ml
          </button>
        </div>
        <label class="bio-group">
          <span class="bio-label">Or custom</span>
          <div class="input-row">
            <input
              type="number"
              v-model.number="servingDisplay"
              min="1"
              step="0.5"
              class="bio-input"
            />
            <span class="bio-unit">{{ unitLabel }}</span>
          </div>
        </label>
        <p class="hint">
          {{ dropCount }} drops to hit your goal
          ({{ Math.round(mlToUnit(dailyTargetMl, unit)) }} {{ unitLabel }}).
        </p>
      </div>

      <div class="card">
        <h3>Display</h3>
        <label class="row checkbox-row">
          <input type="checkbox" v-model="showOnDashboard" />
          <span>Show summary on Dashboard</span>
        </label>
      </div>
    </template>
  </div>
</template>

<style scoped>
.water-page { max-width: 560px; }
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

.checkbox-row span { font-size: var(--font-size-s); color: var(--text); }
.checkbox-row input { accent-color: var(--primary); }

.unit-tabs {
  display: inline-flex;
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 2px;
  gap: 2px;
}
.unit-tab {
  padding: 0.35rem 0.85rem;
  background: none;
  border: none;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
}
.unit-tab.active {
  background: var(--surface-raised);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}
.preset-chip {
  padding: 0.35rem 0.75rem;
  font-size: var(--font-size-s);
  background: var(--bg);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  cursor: pointer;
}
.preset-chip.active {
  background: var(--primary);
  color: var(--text-on-primary);
  border-color: var(--primary);
  font-weight: var(--font-weight-bold);
}

.bio-group { display: flex; flex-direction: column; gap: var(--space-1); }
.bio-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.input-row { display: flex; align-items: center; gap: var(--space-2); }
.bio-input {
  padding: 0.4rem 0.55rem;
  font-size: var(--font-size-s);
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  font-variant-numeric: tabular-nums;
  width: 120px;
}
.bio-unit { font-size: var(--font-size-xs); color: var(--text-tertiary); }
.hint { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: var(--space-2) 0 0; }
</style>
