<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';

const store = useSettingsStore();

const enabled = ref(true);
// "low" = 0.4 (show most signals), "high" = 0.65 (only strong ones).
// Stored numerically; the segmented control round-trips through `level`.
const minConfidence = ref(0.4);
const hydrated = ref(false);

const LEVELS = [
  { value: 0.4,  key: 'low',  label: 'Low',  sub: 'Show more findings, even weaker patterns (≥40% confidence).' },
  { value: 0.65, key: 'high', label: 'High', sub: 'Only show strong patterns (≥65% confidence).' },
];

const level = computed(() => {
  const exact = LEVELS.find((l) => Math.abs(l.value - minConfidence.value) < 0.01);
  if (exact) return exact.key;
  return minConfidence.value >= 0.55 ? 'high' : 'low';
});
const activeLevel = computed(() => LEVELS.find((l) => l.key === level.value) || LEVELS[0]);

function setLevel(key) {
  const lvl = LEVELS.find((l) => l.key === key);
  if (lvl) minConfidence.value = lvl.value;
}

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  const i = store.settings?.insights || {};
  enabled.value = i.enabled !== false;
  minConfidence.value = Number.isFinite(Number(i.minConfidence)) ? Number(i.minConfidence) : 0.4;
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
    insights: {
      enabled: enabled.value,
      minConfidence: minConfidence.value,
    },
  });
}

watch([enabled, minConfidence], scheduleSave);
</script>

<template>
  <div class="insights-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">
        ‹ Profile
      </router-link>
      <h2 class="page-title">Insights</h2>
    </div>

    <div class="card">
      <label class="row toggle-row">
        <span class="toggle-label">
          <span class="toggle-name">Enable insights</span>
          <span class="toggle-sub">
            Show the Insights card on the Dashboard with auto-detected
            patterns from your logs.
          </span>
        </span>
        <input type="checkbox" v-model="enabled" />
      </label>
    </div>

    <template v-if="enabled">
      <div class="card">
        <h3>Confidence floor</h3>
        <p class="hint">
          Findings below this level are hidden. Lower = more (and weaker)
          findings; higher = fewer but stronger patterns.
        </p>
        <div class="seg-control">
          <button
            v-for="l in LEVELS"
            :key="l.key"
            type="button"
            class="seg-btn"
            :class="{ active: level === l.key }"
            @click="setLevel(l.key)"
          >
            {{ l.label }}
          </button>
        </div>
        <p class="hint sub">{{ activeLevel.sub }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.insights-page { max-width: 560px; }
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

.hint { font-size: var(--font-size-xs); color: var(--text-tertiary); margin: 0 0 var(--space-3); }
.hint.sub { margin: var(--space-2) 0 0; }

.seg-control {
  display: inline-flex;
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 2px;
  gap: 2px;
}
.seg-btn {
  padding: 0.4rem 1rem;
  background: none;
  border: none;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.seg-btn:hover { color: var(--text); }
.seg-btn.active {
  background: var(--surface-raised);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}
</style>
