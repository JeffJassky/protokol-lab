<script setup>
import { ref, computed, onMounted } from 'vue';
import { useMetricsStore } from '../../stores/metrics.js';
import { useSettingsStore } from '../../stores/settings.js';
import {
  DIMENSIONS,
  defaultUnitFor,
  unitLabel,
} from '../../../../shared/units.js';
import {
  METRIC_CATEGORIES,
  CUSTOM_METRIC_DIMENSIONS,
} from '../../../../shared/logging/metricPresets.js';

const metricsStore = useMetricsStore();
const settingsStore = useSettingsStore();

const adding = ref(false);
const newName = ref('');
const newDimension = ref('length');
const error = ref('');

const editingId = ref(null);
const editName = ref('');
const editDisplayUnit = ref('');

onMounted(async () => {
  if (!settingsStore.loaded) await settingsStore.fetchSettings();
  await metricsStore.fetchMetrics();
});

const unitSystem = computed(() => settingsStore.settings?.unitSystem || 'imperial');

async function setUnitSystem(system) {
  if (system === unitSystem.value) return;
  await settingsStore.patchSettings({ unitSystem: system });
}

const grouped = computed(() => {
  const out = METRIC_CATEGORIES.map((cat) => ({
    ...cat,
    metrics: metricsStore.metrics.filter((m) => (m.category || 'custom') === cat.key),
  }));
  return out.filter((g) => g.metrics.length > 0 || g.key === 'custom');
});

function displayUnitFor(metric) {
  return metric.displayUnit || defaultUnitFor(metric.dimension, unitSystem.value);
}

async function toggle(metric) {
  await metricsStore.updateMetric(metric._id, { enabled: !metric.enabled });
}

function startEdit(metric) {
  editingId.value = metric._id;
  editName.value = metric.name;
  editDisplayUnit.value = metric.displayUnit || '';
}

async function saveEdit(metric) {
  const patch = { displayUnit: editDisplayUnit.value || null };
  if (!metric.isPreset) patch.name = editName.value;
  await metricsStore.updateMetric(metric._id, patch);
  editingId.value = null;
}

function cancelEdit() {
  editingId.value = null;
}

async function handleDelete(metric) {
  if (metric.isPreset) return;
  if (!confirm(`Delete "${metric.name}" and all its history?`)) return;
  await metricsStore.deleteMetric(metric._id);
}

async function handleAdd() {
  error.value = '';
  if (!newName.value.trim()) {
    error.value = 'Name required';
    return;
  }
  try {
    await metricsStore.createMetric({
      name: newName.value.trim(),
      dimension: newDimension.value,
    });
    newName.value = '';
    newDimension.value = 'length';
    adding.value = false;
  } catch (err) {
    error.value = err.message || 'Failed to create metric';
  }
}

function unitsForDimension(dimension) {
  return DIMENSIONS[dimension]?.units || [];
}
</script>

<template>
  <div class="metrics-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back"
        >‹ Profile</router-link
      >
      <h2 class="page-title">Measurements</h2>
    </div>

    <div class="card">
      <div class="field">
        <label>Unit system</label>
        <div class="seg-toggle">
          <button
            type="button"
            class="seg-option"
            :class="{ active: unitSystem === 'imperial' }"
            @click="setUnitSystem('imperial')"
          >
            Imperial
          </button>
          <button
            type="button"
            class="seg-option"
            :class="{ active: unitSystem === 'metric' }"
            @click="setUnitSystem('metric')"
          >
            Metric
          </button>
        </div>
        <p class="hint">
          Default unit for new measurements. Each measurement can override below.
        </p>
      </div>
    </div>

    <div
      v-for="group in grouped"
      :key="group.key"
      class="card"
    >
      <h3 class="group-title">{{ group.label }}</h3>

      <ul class="metric-list">
        <li
          v-for="metric in group.metrics"
          :key="metric._id"
          class="metric-row"
        >
          <template v-if="editingId === metric._id">
            <div class="edit-row">
              <input
                v-if="!metric.isPreset"
                v-model="editName"
                type="text"
                class="edit-name-input"
                placeholder="Name"
              />
              <span v-else class="metric-name locked">{{ metric.name }}</span>
              <select v-model="editDisplayUnit" class="unit-select">
                <option value="">
                  Default ({{ unitLabel(defaultUnitFor(metric.dimension, unitSystem)) }})
                </option>
                <option
                  v-for="u in unitsForDimension(metric.dimension)"
                  :key="u"
                  :value="u"
                >
                  {{ unitLabel(u) }}
                </option>
              </select>
              <button class="btn-text" type="button" @click="cancelEdit">
                Cancel
              </button>
              <button class="btn-primary small" type="button" @click="saveEdit(metric)">
                Save
              </button>
            </div>
          </template>
          <template v-else>
            <label class="toggle-row">
              <input
                type="checkbox"
                :checked="metric.enabled"
                @change="toggle(metric)"
              />
              <span class="metric-name">{{ metric.name }}</span>
              <span class="metric-unit">{{ unitLabel(displayUnitFor(metric)) }}</span>
            </label>
            <div class="row-actions">
              <button
                class="row-action"
                type="button"
                title="Edit"
                @click="startEdit(metric)"
              >
                Edit
              </button>
              <button
                v-if="!metric.isPreset"
                class="row-action danger"
                type="button"
                title="Delete"
                @click="handleDelete(metric)"
              >
                Delete
              </button>
            </div>
          </template>
        </li>
        <li v-if="group.key === 'custom' && group.metrics.length === 0" class="empty-hint">
          No custom measurements yet.
        </li>
      </ul>

      <div v-if="group.key === 'custom'" class="add-area">
        <button
          v-if="!adding"
          type="button"
          class="btn-secondary"
          @click="adding = true"
        >
          + Add custom measurement
        </button>
        <form v-else class="add-form" @submit.prevent="handleAdd">
          <input
            v-model="newName"
            type="text"
            placeholder="Measurement name (e.g. Resting heart rate)"
            autofocus
          />
          <select v-model="newDimension">
            <option
              v-for="dim in CUSTOM_METRIC_DIMENSIONS"
              :key="dim"
              :value="dim"
            >
              {{ dim }}
            </option>
          </select>
          <button class="btn-primary" type="submit">Add</button>
          <button
            class="btn-text"
            type="button"
            @click="adding = false; newName = ''; error = ''"
          >
            Cancel
          </button>
        </form>
        <p v-if="error" class="error">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metrics-page { max-width: 560px; }

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

.field label {
  display: block;
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--space-2);
}
.hint {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  margin: var(--space-2) 0 0;
}

.seg-toggle {
  display: inline-flex;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: 2px;
  gap: 2px;
}
.seg-option {
  padding: 0.35rem 0.8rem;
  background: none;
  border: none;
  border-radius: var(--radius-small);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.seg-option:hover { color: var(--text); }
.seg-option.active {
  background: var(--surface);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}

.group-title {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-m);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.metric-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.metric-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}
.metric-row:last-child { border-bottom: none; }

.toggle-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  flex: 1;
  min-width: 0;
}
.toggle-row input[type='checkbox'] {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  cursor: pointer;
}
.metric-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.metric-name.locked { color: var(--text-secondary); }
.metric-unit {
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  font-variant-numeric: tabular-nums;
}

.row-actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
.row-action {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  border-radius: var(--radius-small);
}
.row-action:hover { color: var(--text); background: var(--bg); }
.row-action.danger:hover { color: var(--danger); background: var(--danger-soft); }

.edit-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  width: 100%;
}
.edit-name-input {
  flex: 1;
  min-width: 140px;
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  background: var(--bg);
  color: var(--text);
}
.unit-select {
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  background: var(--bg);
  color: var(--text);
}

.add-area { margin-top: var(--space-4); }
.add-form {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}
.add-form input[type='text'] {
  flex: 1;
  min-width: 180px;
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  background: var(--bg);
  color: var(--text);
}
.add-form select {
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  background: var(--bg);
  color: var(--text);
}

.empty-hint {
  list-style: none;
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  padding: var(--space-2) 0;
}

.error {
  color: var(--danger);
  font-size: var(--font-size-s);
  margin-top: var(--space-2);
}

.btn-primary.small {
  padding: 0.35rem 0.8rem;
  font-size: var(--font-size-s);
}
</style>
