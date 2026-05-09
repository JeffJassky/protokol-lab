<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';
import {
  GENETICS_PANELS,
  flattenGeneticsNested,
} from '../../../../shared/geneticsPanels.js';

const store = useSettingsStore();

// Local mirror of settings.genetics flattened to dotPath → option string
// (e.g. 'pharmacogenomics.cyp2d6_status' → 'Normal'). Same debounced-save
// pattern as the bloodwork page.
const values = ref({});
const hydrated = ref(false);

function getValue(key) {
  return values.value[key];
}

function setValue(key, raw) {
  // Empty string clears (revert to default). Booleans + numeric 0 are
  // valid values — only treat null/undefined/'' as a clear.
  if (raw === '' || raw === null || raw === undefined) {
    if (values.value[key] === undefined) return;
    const next = { ...values.value };
    delete next[key];
    values.value = next;
    return;
  }
  values.value = { ...values.value, [key]: raw };
}

function clearValue(key) {
  setValue(key, '');
}

const setCount = computed(() => Object.keys(values.value).length);

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  values.value = flattenGeneticsNested(store.settings?.genetics);
  hydrated.value = true;
});

let saveTimer = null;
function scheduleSave() {
  if (!hydrated.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 600);
}

async function persist() {
  await store.patchSettings({ genetics: values.value });
}

watch(values, scheduleSave, { deep: true });
</script>

<template>
  <div class="genetics-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">
        ‹ Profile
      </router-link>
      <h2 class="page-title">Genetics</h2>
      <span class="set-count">{{ setCount }} set</span>
    </div>

    <div class="card callout">
      Genetic markers personalize the simulation engine — drug-clearance
      curves, methylation pathways, lipid handling, and more. Most fields
      come from a 23andMe-style report. Leave anything unknown blank;
      defaults are population-average.
    </div>

    <div
      v-for="panel in GENETICS_PANELS"
      :key="panel.id"
      class="card panel"
    >
      <h3 class="panel-label">{{ panel.label }}</h3>
      <p v-if="panel.blurb" class="panel-blurb">{{ panel.blurb }}</p>

      <div
        v-for="field in panel.fields"
        :key="field.key"
        class="field"
      >
        <div class="field-meta">
          <div class="field-label">{{ field.label }}</div>
          <div v-if="field.hint" class="field-hint">{{ field.hint }}</div>
        </div>
        <div class="field-input-group">
          <select
            v-if="field.kind === 'select'"
            :value="getValue(field.key) ?? ''"
            class="field-select"
            @change="setValue(field.key, $event.target.value)"
          >
            <option value="">— not set —</option>
            <option
              v-for="opt in field.options"
              :key="opt"
              :value="opt"
            >
              {{ opt }}
            </option>
          </select>

          <label
            v-else-if="field.kind === 'boolean'"
            class="field-bool"
          >
            <input
              type="checkbox"
              :checked="getValue(field.key) === true"
              @change="setValue(field.key, $event.target.checked)"
            />
            <span>Present</span>
          </label>

          <select
            v-else-if="field.kind === 'number' && field.enumValues"
            :value="getValue(field.key) ?? ''"
            class="field-select"
            @change="setValue(field.key, $event.target.value === '' ? '' : Number($event.target.value))"
          >
            <option value="">— not set —</option>
            <option
              v-for="n in field.enumValues"
              :key="n"
              :value="n"
            >
              {{ n }}
            </option>
          </select>

          <input
            v-else-if="field.kind === 'number'"
            type="number"
            :value="getValue(field.key) ?? ''"
            :min="field.min"
            :max="field.max"
            :step="field.step"
            class="field-input"
            @input="setValue(field.key, $event.target.value === '' ? '' : Number($event.target.value))"
          />

          <button
            v-if="getValue(field.key) !== undefined"
            type="button"
            class="reset-btn"
            :title="'Clear'"
            @click="clearValue(field.key)"
          >×</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.genetics-page { max-width: 720px; }
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
.set-count {
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

.panel-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin: 0 0 var(--space-1);
}
.panel-blurb {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  line-height: 1.4;
}

.field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border);
}
.field:first-of-type { border-top: none; }
.field-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.field-label {
  font-size: var(--font-size-s);
  color: var(--text);
  font-weight: var(--font-weight-medium);
}
.field-hint {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  line-height: 1.4;
}
.field-input-group { display: flex; align-items: center; gap: var(--space-1); }
.field-select {
  min-width: 200px;
  padding: 4px 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: var(--font-size-s);
  color: var(--text);
  font-family: var(--font-mono);
}
.field-select:focus { border-color: var(--primary); outline: none; }
.field-input {
  width: 100px;
  padding: 4px 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: var(--font-size-s);
  color: var(--text);
  font-family: var(--font-mono);
  text-align: right;
}
.field-input:focus { border-color: var(--primary); outline: none; }
.field-bool {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
}
.reset-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: var(--font-size-m);
  line-height: 1;
}
.reset-btn:hover { color: var(--text); }

@media (max-width: 540px) {
  .field { flex-direction: column; align-items: flex-start; }
  .field-select { min-width: 0; width: 100%; }
}
</style>
