<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';
import {
  BLOODWORK_PANELS,
  BLOODWORK_FIELD_INDEX,
  flattenBloodworkNested,
} from '../../../../shared/bloodworkPanels.js';

const store = useSettingsStore();

// Local mirror of settings.bloodwork as a flat dotPath → value map.
// Same debounced-save pattern as the other settings sub-pages. Server
// stores the nested shape (Subject.bloodwork format); we flatten on read
// for easier per-field ref/binding and unflatten on write inside persist().
const values = ref({});
const hydrated = ref(false);

function getValue(key) {
  return values.value[key];
}

function setValue(key, raw) {
  // Empty string / null clears the override (revert to default).
  // Categorical fields write the option string directly; numeric fields
  // round-trip through Number().
  if (raw === '' || raw === null || raw === undefined) {
    if (values.value[key] === undefined) return;
    const next = { ...values.value };
    delete next[key];
    values.value = next;
    return;
  }
  const field = BLOODWORK_FIELD_INDEX.get(key);
  if (field?.isCategorical) {
    if (!field.options.includes(String(raw))) return;
    values.value = { ...values.value, [key]: String(raw) };
    return;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return;
  values.value = { ...values.value, [key]: n };
}

function clearValue(key) {
  if (values.value[key] === undefined) return;
  const next = { ...values.value };
  delete next[key];
  values.value = next;
}

function resetAll() {
  if (!Object.keys(values.value).length) return;
  if (!confirm('Reset all bloodwork values to population defaults?')) return;
  values.value = {};
}

// Status color: green inside ref range, amber within 20% buffer, red far
// outside. Mirrors the lab's getStatusColor logic — kept simple here
// since we don't have the precision-slider component to render bands.
function statusFor(field) {
  if (field.isCategorical) return '';
  const v = getValue(field.key);
  if (v == null) return '';
  if (!Number.isFinite(field.refMin) || !Number.isFinite(field.refMax)) return '';
  if (v >= field.refMin && v <= field.refMax) return 'in-range';
  const refRange = field.refMax - field.refMin;
  const lower = field.refMin - refRange * 0.2;
  const upper = field.refMax + refRange * 0.2;
  if ((v >= lower && v < field.refMin) || (v > field.refMax && v <= upper)) {
    return 'near-range';
  }
  return 'out-of-range';
}

const setCount = computed(() => Object.keys(values.value).length);

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  values.value = flattenBloodworkNested(store.settings?.bloodwork);
  hydrated.value = true;
});

let saveTimer = null;
function scheduleSave() {
  if (!hydrated.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 600);
}

async function persist() {
  await store.patchSettings({ bloodwork: values.value });
}

watch(values, scheduleSave, { deep: true });
</script>

<template>
  <div class="bloodwork-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">
        ‹ Profile
      </router-link>
      <h2 class="page-title">Bloodwork</h2>
      <span class="set-count">{{ setCount }} set</span>
    </div>

    <div class="card callout">
      Values you set here flow into the simulation engine's subject.
      Anything left blank uses population averages — there's no need to
      fill in the whole panel. Most useful: glucose, HbA1c, insulin, TSH,
      vitamin D, hormone levels.
    </div>

    <div
      v-for="panel in BLOODWORK_PANELS"
      :key="panel.id"
      class="card panel"
    >
      <h3 class="panel-label">{{ panel.label }}</h3>

      <div
        v-for="field in panel.fields"
        :key="field.key"
        class="field"
      >
        <div class="field-row">
          <div class="field-meta">
            <div class="field-label">{{ field.label }}</div>
            <div v-if="!field.isCategorical" class="field-ref">
              Ref: {{ field.refMin }} – {{ field.refMax }} {{ field.unit }}
            </div>
          </div>

          <div class="field-input-group">
            <button
              v-if="getValue(field.key) !== undefined"
              type="button"
              class="reset-btn"
              :title="'Reset to default'"
              @click="clearValue(field.key)"
            >×</button>

            <select
              v-if="field.isCategorical"
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

            <template v-else>
              <input
                type="number"
                :value="getValue(field.key)"
                :placeholder="String(field.default)"
                :step="field.step"
                :class="['field-input', statusFor(field)]"
                @input="setValue(field.key, $event.target.value)"
              />
              <span v-if="field.unit" class="field-unit">{{ field.unit }}</span>
            </template>
          </div>
        </div>

        <input
          v-if="!field.isCategorical"
          type="range"
          :value="getValue(field.key) ?? field.default"
          :min="field.sliderMin"
          :max="field.sliderMax"
          :step="field.step"
          class="field-slider"
          @input="setValue(field.key, $event.target.value)"
        />
      </div>
    </div>

    <button
      v-if="setCount > 0"
      type="button"
      class="reset-all-btn"
      @click="resetAll"
    >
      Reset all bloodwork values
    </button>
  </div>
</template>

<style scoped>
.bloodwork-page { max-width: 720px; }
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
  margin: 0 0 var(--space-3);
}

.field {
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border);
}
.field:first-of-type { border-top: none; }

.field-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}
.field-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.field-label {
  font-size: var(--font-size-s);
  color: var(--text);
  font-weight: var(--font-weight-medium);
}
.field-ref {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.field-input-group {
  display: flex;
  align-items: center;
  gap: var(--space-1);
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
.field-input {
  width: 80px;
  padding: 4px 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: var(--font-size-s);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  color: var(--text);
  text-align: right;
}
.field-input:focus { border-color: var(--primary); outline: none; }
.field-input.in-range { color: var(--success); }
.field-input.near-range { color: var(--warning); }
.field-input.out-of-range { color: var(--danger); }
.field-unit {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  min-width: 40px;
}
.field-select {
  padding: 4px 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: var(--font-size-s);
  color: var(--text);
  font-family: var(--font-mono);
  min-width: 140px;
}
.field-select:focus { border-color: var(--primary); outline: none; }
.field-slider {
  width: 100%;
  margin-top: var(--space-1);
}

.reset-all-btn {
  width: 100%;
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-s);
}
.reset-all-btn:hover { color: var(--text); border-color: var(--text-tertiary); }
</style>
