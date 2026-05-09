<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';
import { CONDITION_LIBRARY } from '@kyneticbio/core';

const store = useSettingsStore();

// Local mirror of settings.conditions: { [key]: { enabled, params } }.
// We hydrate from the user's saved state on mount but always fall back
// to the library's defaults so adding a brand-new condition to core
// surfaces it here without a migration.
const state = ref({});
const hydrated = ref(false);

function ensure(conditionKey) {
  const def = CONDITION_LIBRARY.find((c) => c.key === conditionKey);
  if (!def) return null;
  if (!state.value[conditionKey]) {
    const params = {};
    for (const p of def.params) params[p.key] = p.default;
    state.value = { ...state.value, [conditionKey]: { enabled: false, params } };
  } else if (!state.value[conditionKey].params) {
    state.value[conditionKey] = {
      ...state.value[conditionKey],
      params: Object.fromEntries(def.params.map((p) => [p.key, p.default])),
    };
  }
  return state.value[conditionKey];
}

function toggle(conditionKey, evt) {
  const e = ensure(conditionKey);
  if (!e) return;
  state.value[conditionKey] = { ...e, enabled: Boolean(evt.target.checked) };
}

function setParam(conditionKey, paramKey, evt) {
  const e = ensure(conditionKey);
  if (!e) return;
  const n = Number(evt.target.value);
  if (!Number.isFinite(n)) return;
  state.value[conditionKey] = {
    ...e,
    params: { ...e.params, [paramKey]: n },
  };
}

const grouped = computed(() => {
  const groups = new Map();
  for (const def of CONDITION_LIBRARY) {
    const cat = def.category || 'other';
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(def);
  }
  return [...groups.entries()];
});

const enabledCount = computed(
  () => Object.values(state.value).filter((c) => c?.enabled).length,
);

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  const saved = store.settings?.conditions || {};
  // Pre-fill the full state map so v-model bindings always have an entry
  // to write into. Saved values take precedence over library defaults
  // for params; missing entries default to disabled.
  const next = {};
  for (const def of CONDITION_LIBRARY) {
    const userEntry = saved[def.key] || {};
    const params = {};
    for (const p of def.params) {
      const userVal = userEntry.params?.[p.key];
      params[p.key] = Number.isFinite(userVal) ? Number(userVal) : p.default;
    }
    next[def.key] = { enabled: Boolean(userEntry.enabled), params };
  }
  state.value = next;
  hydrated.value = true;
});

let saveTimer = null;
function scheduleSave() {
  if (!hydrated.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 500);
}

async function persist() {
  // Only ship enabled conditions or those with non-default params, but
  // simpler + future-proof: just ship the whole state. Sanitizer drops
  // unknown keys server-side.
  await store.patchSettings({ conditions: state.value });
}

watch(state, scheduleSave, { deep: true });

function categoryLabel(cat) {
  return ({
    clinical: 'Clinical',
    genetic: 'Genetic',
    lifestyle: 'Lifestyle',
    experimental: 'Experimental',
  })[cat] || 'Other';
}
</script>

<template>
  <div class="conditions-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">
        ‹ Profile
      </router-link>
      <h2 class="page-title">Conditions</h2>
      <span class="enabled-count">{{ enabledCount }} active</span>
    </div>

    <div class="card callout">
      Enabling a condition shifts the simulation engine's receptor
      densities, transporter activities, and signal baselines to match
      its physiology. Use the severity sliders to dial each one in;
      everything off is the population default.
    </div>

    <div
      v-for="[cat, conds] in grouped"
      :key="cat"
      class="card cat-section"
    >
      <h3 class="cat-label">{{ categoryLabel(cat) }}</h3>

      <div
        v-for="def in conds"
        :key="def.key"
        class="condition"
      >
        <label class="condition-row">
          <span class="condition-meta">
            <span class="condition-name">{{ def.label }}</span>
            <span class="condition-desc">{{ def.description.physiology }}</span>
          </span>
          <input
            type="checkbox"
            :checked="state[def.key]?.enabled"
            @change="(e) => toggle(def.key, e)"
          />
        </label>

        <div
          v-if="state[def.key]?.enabled && def.params.length"
          class="param-list"
        >
          <div
            v-for="param in def.params"
            :key="param.key"
            class="param"
          >
            <div class="param-head">
              <span class="param-label">{{ param.label }}</span>
              <span class="param-value">
                {{ Number(state[def.key].params[param.key]).toFixed(2) }}
              </span>
            </div>
            <input
              v-if="param.type === 'slider'"
              type="range"
              :min="param.min"
              :max="param.max"
              :step="param.step"
              :value="state[def.key].params[param.key]"
              class="param-slider"
              @input="(e) => setParam(def.key, param.key, e)"
            />
            <select
              v-else-if="param.type === 'select'"
              :value="state[def.key].params[param.key]"
              class="param-select"
              @change="(e) => setParam(def.key, param.key, e)"
            >
              <option
                v-for="opt in param.options"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conditions-page { max-width: 720px; }
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
.enabled-count {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}
.callout {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.5;
  border-left: 2px solid var(--primary);
}

.cat-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin: 0 0 var(--space-3);
}

.condition {
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border);
}
.condition:first-of-type { border-top: none; }
.condition-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  cursor: pointer;
}
.condition-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.condition-name {
  font-size: var(--font-size-s);
  color: var(--text);
  font-weight: var(--font-weight-medium);
}
.condition-desc {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  line-height: 1.4;
}

.param-list {
  margin-top: var(--space-3);
  padding-left: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-left: 2px solid var(--border);
}
.param-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--font-size-xs);
}
.param-label {
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.param-value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.param-slider { width: 100%; }
.param-select {
  width: 100%;
  padding: 4px 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: var(--font-size-s);
  color: var(--text);
}
</style>
