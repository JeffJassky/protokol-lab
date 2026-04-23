<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import { useSettingsStore } from '../stores/settings.js';
import { useTheme } from '../composables/useTheme.js';

const store = useSettingsStore();
const theme = useTheme();

const sex = ref('male');
const heightFeet = ref(5);
const heightInches = ref(10);
const currentWeightLbs = ref(180);
const goalWeightLbs = ref(170);
const bmr = ref('');
const doseIntervalDays = ref(5);
const calories = ref(2000);
const proteinGrams = ref(150);
const fatGrams = ref(65);
const carbsGrams = ref(200);

const saving = ref(false);
const saved = ref(false);
const error = ref('');

const totalHeightInches = computed(() => heightFeet.value * 12 + heightInches.value);

// Daily calorie delta vs BMR and the resulting est. weekly weight change.
const calorieDelta = computed(() => {
  const b = Number(bmr.value);
  const c = Number(calories.value);
  if (!b || !c) return null;
  return c - b;
});
const weeklyLbs = computed(() => {
  if (calorieDelta.value == null) return null;
  return calorieDelta.value / 500;
});
function signed(n, digits = 0) {
  const fixed = n.toFixed(digits);
  return n > 0 ? `+${fixed}` : fixed;
}

// ---- Macro allocation sliders -------------------------------------------
// Protein (4 kcal/g) is allocated first; then the remaining calories are
// split between fat (9 kcal/g) and carbs (4 kcal/g) via a second slider.
// Carbs always fills the gap so the three macros always sum to total calories.

const proteinKcal = computed(() => proteinGrams.value * 4);
const remainingAfterProtein = computed(() => Math.max(0, calories.value - proteinKcal.value));
const fatKcal = computed(() => fatGrams.value * 9);
const carbsKcal = computed(() => Math.max(0, remainingAfterProtein.value - fatKcal.value));

// Auto-derived carbs — user never controls this directly.
const carbsComputed = computed(() => Math.round(carbsKcal.value / 4));

// Max slider values.
const maxProteinGrams = computed(() => Math.floor(calories.value / 4));
const maxFatGrams = computed(() => Math.floor(remainingAfterProtein.value / 9));

// Percentage of total calories each macro occupies (for the visual bar).
const pctProtein = computed(() => (calories.value ? (proteinKcal.value / calories.value) * 100 : 0));
const pctFat = computed(() => (calories.value ? (fatKcal.value / calories.value) * 100 : 0));
const pctCarbs = computed(() => Math.max(0, 100 - pctProtein.value - pctFat.value));

// Keep carbs ref in sync (for save) and clamp protein/fat when calories shrinks.
watch(carbsComputed, (v) => { carbsGrams.value = v; });
watch(calories, () => {
  if (proteinGrams.value > maxProteinGrams.value) proteinGrams.value = maxProteinGrams.value;
  if (fatGrams.value > maxFatGrams.value) fatGrams.value = maxFatGrams.value;
});
watch(proteinGrams, () => {
  if (fatGrams.value > maxFatGrams.value) fatGrams.value = maxFatGrams.value;
});

// ---- Single-bar allocation drag handling --------------------------------
const allocBarRef = ref(null);
let activeHandle = null;

function pxToKcal(clientX) {
  const rect = allocBarRef.value.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return pct * calories.value;
}

function onAllocDown(e) {
  const target = e.target.closest('.handle');
  if (!target) return;
  activeHandle = target.dataset.handle;
  const onMove = (ev) => {
    const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const kcalPos = pxToKcal(clientX);

    if (activeHandle === '1') {
      // Handle 1 controls protein|fat boundary.
      // Can't go past handle 2 (protein + fat boundary).
      const maxKcal = calories.value - fatKcal.value;
      const clamped = Math.max(0, Math.min(maxKcal, kcalPos));
      proteinGrams.value = Math.round(clamped / 4);
    } else {
      // Handle 2 controls fat|carbs boundary.
      // Must stay to the right of handle 1.
      const minKcal = proteinKcal.value;
      const clamped = Math.max(minKcal, Math.min(calories.value, kcalPos));
      const fatKcalNew = clamped - proteinKcal.value;
      fatGrams.value = Math.round(fatKcalNew / 9);
    }
  };
  const onUp = () => {
    activeHandle = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onUp);
}

onMounted(async () => {
  if (!store.loaded) {
    await store.fetchSettings();
  }
  if (store.settings) {
    const s = store.settings;
    sex.value = s.sex;
    heightFeet.value = Math.floor(s.heightInches / 12);
    heightInches.value = s.heightInches % 12;
    currentWeightLbs.value = s.currentWeightLbs;
    goalWeightLbs.value = s.goalWeightLbs || '';
    bmr.value = s.bmr || '';
    doseIntervalDays.value = s.doseIntervalDays || 5;
    calories.value = s.targets.calories;
    proteinGrams.value = s.targets.proteinGrams;
    fatGrams.value = s.targets.fatGrams;
    carbsGrams.value = s.targets.carbsGrams;
  }
});

async function handleSave() {
  error.value = '';
  saved.value = false;
  saving.value = true;
  try {
    await store.updateSettings({
      sex: sex.value,
      heightInches: totalHeightInches.value,
      currentWeightLbs: Number(currentWeightLbs.value),
      goalWeightLbs: goalWeightLbs.value ? Number(goalWeightLbs.value) : null,
      bmr: bmr.value ? Number(bmr.value) : null,
      doseIntervalDays: Number(doseIntervalDays.value),
      targets: {
        calories: Number(calories.value),
        proteinGrams: Number(proteinGrams.value),
        fatGrams: Number(fatGrams.value),
        carbsGrams: Number(carbsGrams.value),
      },
    });
    saved.value = true;
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <h2>Settings</h2>

    <div class="card">
      <h3>Appearance</h3>
      <div class="field">
        <label>Theme</label>
        <div class="theme-toggle">
          <button
            type="button"
            class="theme-option"
            :class="{ active: theme === 'light' }"
            @click="theme = 'light'"
          >Light</button>
          <button
            type="button"
            class="theme-option"
            :class="{ active: theme === 'dark' }"
            @click="theme = 'dark'"
          >Dark</button>
          <button
            type="button"
            class="theme-option"
            :class="{ active: theme === 'auto' }"
            @click="theme = 'auto'"
          >System</button>
        </div>
      </div>
    </div>

    <form @submit.prevent="handleSave">
      <div class="card">
        <h3>Profile</h3>
        <div class="field">
          <label>Sex</label>
          <div class="radio-group">
            <label class="radio"><input type="radio" v-model="sex" value="male" /> Male</label>
            <label class="radio"><input type="radio" v-model="sex" value="female" /> Female</label>
          </div>
        </div>
        <div class="field">
          <label>Height</label>
          <div class="inline-fields">
            <input type="number" v-model.number="heightFeet" min="3" max="8" class="sm" /> <span>ft</span>
            <input type="number" v-model.number="heightInches" min="0" max="11" class="sm" /> <span>in</span>
          </div>
        </div>
        <div class="field">
          <label for="weight">Current Weight (lbs)</label>
          <input id="weight" type="number" v-model.number="currentWeightLbs" step="0.1" required />
        </div>
        <div class="field">
          <label for="goal">Goal Weight (lbs)</label>
          <input id="goal" type="number" v-model.number="goalWeightLbs" step="0.1" />
        </div>
        <div class="field">
          <label for="bmr">BMR (kcal/day)</label>
          <input id="bmr" type="number" v-model.number="bmr" step="1" placeholder="Optional" />
          <p class="field-hint">Basal metabolic rate — calories burned at rest. Leave blank if unknown.</p>
        </div>
        <div class="field">
          <label for="doseInterval">Retatrutide dose interval (days)</label>
          <input id="doseInterval" type="number" v-model.number="doseIntervalDays" min="5" max="7" step="1" />
          <p class="field-hint">How often you inject — typically every 5 to 7 days.</p>
        </div>
      </div>

      <div class="card">
        <h3>Daily Targets</h3>

        <div class="field">
          <label for="calories">Calories</label>
          <input id="calories" type="number" v-model.number="calories" min="400" step="50" required />
          <p v-if="calorieDelta != null" class="field-hint calc">
            <span :class="calorieDelta < 0 ? 'neg' : 'pos'">
              {{ signed(calorieDelta) }} kcal/day
            </span>
            vs BMR ·
            <span :class="weeklyLbs < 0 ? 'neg' : 'pos'">
              {{ signed(weeklyLbs, 2) }} lbs/week
            </span>
          </p>
          <p v-else class="field-hint">Set BMR above to see estimated weekly change.</p>
        </div>

        <!-- Single allocation bar with two drag handles:
             handle 1 = protein|fat boundary, handle 2 = fat|carbs boundary -->
        <div
          class="alloc-bar"
          ref="allocBarRef"
          @mousedown="onAllocDown"
          @touchstart.prevent="onAllocDown"
        >
          <div class="seg seg-p" :style="{ width: pctProtein + '%' }" />
          <div class="seg seg-f" :style="{ width: pctFat + '%' }" />
          <div class="seg seg-c" :style="{ width: pctCarbs + '%' }" />
          <div class="handle handle-1" :style="{ left: pctProtein + '%' }" data-handle="1" />
          <div class="handle handle-2" :style="{ left: (pctProtein + pctFat) + '%' }" data-handle="2" />
        </div>

        <div class="alloc-legend">
          <div class="alloc-legend-item">
            <span class="legend-dot dot-p"></span>
            <span class="alloc-label label-p">Protein</span>
            <span class="alloc-spacer"></span>
            <input type="number" class="alloc-input" :value="proteinGrams" min="0" :max="maxProteinGrams" step="5" @change="proteinGrams = Math.min(Number($event.target.value), maxProteinGrams)" /><span class="alloc-unit">g</span>
            <span class="alloc-detail">{{ proteinKcal }} kcal · {{ Math.round(pctProtein) }}%</span>
          </div>
          <div class="alloc-legend-item">
            <span class="legend-dot dot-f"></span>
            <span class="alloc-label label-f">Fat</span>
            <span class="alloc-spacer"></span>
            <input type="number" class="alloc-input" :value="fatGrams" min="0" :max="maxFatGrams" step="1" @change="fatGrams = Math.min(Number($event.target.value), maxFatGrams)" /><span class="alloc-unit">g</span>
            <span class="alloc-detail">{{ fatKcal }} kcal · {{ Math.round(pctFat) }}%</span>
          </div>
          <div class="alloc-legend-item">
            <span class="legend-dot dot-c"></span>
            <span class="alloc-label label-c">Carbs</span>
            <span class="alloc-spacer"></span>
            <span class="alloc-computed">{{ carbsComputed }}</span><span class="alloc-unit">g</span>
            <span class="alloc-detail">{{ carbsKcal }} kcal · {{ Math.round(pctCarbs) }}%</span>
          </div>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="saved" class="success">Settings saved.</p>
      <button type="submit" :disabled="saving">
        {{ saving ? 'Saving...' : 'Save Settings' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.settings-page { max-width: 480px; }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.card h3 {
  font-size: 0.95rem;
  margin-bottom: 1rem;
  color: var(--text);
}
.field {
  margin-bottom: 0.75rem;
}
.field > label {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
}
.field-hint {
  margin: 0.3rem 0 0;
  font-size: 0.72rem;
  color: var(--text-secondary);
}
.field-hint.calc { font-size: 0.78rem; font-variant-numeric: tabular-nums; }
.field-hint.calc .neg { color: var(--danger); font-weight: 600; }
.field-hint.calc .pos { color: var(--success); font-weight: 600; }
.field input[type="number"] {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.95rem;
  width: 100%;
  background: var(--bg);
  color: var(--text);
}
.field input[type="number"]:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-focus);
}
.field input.sm { width: 64px; }
.inline-fields {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
}
.radio-group {
  display: flex;
  gap: 1.25rem;
}
.radio {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.9rem;
  color: var(--text);
  cursor: pointer;
}
button[type="submit"] {
  padding: 0.6rem 1.5rem;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: 8px;
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}
button[type="submit"]:hover { background: var(--primary-hover); }
button:disabled { opacity: 0.6; cursor: not-allowed; }
/* Macro allocation bar — single bar, two draggable handles */
.alloc-bar {
  position: relative;
  display: flex;
  height: 32px;
  border-radius: 6px;
  overflow: visible;
  margin-bottom: 1rem;
  border: 1px solid var(--border);
  cursor: default;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.seg {
  height: 100%;
  min-width: 0;
  transition: width 0.05s;
}
.seg-p { background: var(--color-protein); border-radius: 5px 0 0 5px; }
.seg-f { background: var(--color-fat); }
.seg-c { background: var(--color-carbs); border-radius: 0 5px 5px 0; }

.handle {
  position: absolute;
  top: 50%;
  width: 6px;
  height: 40px;
  margin-left: -3px;
  margin-top: -20px;
  background: var(--surface);
  border: 2px solid var(--border-strong);
  border-radius: 3px;
  cursor: ew-resize;
  z-index: 2;
  box-shadow: var(--shadow-s);
  transition: border-color 0.1s;
}
.handle:hover { border-color: var(--text-secondary); }

.alloc-legend { margin-bottom: 0.5rem; }
.alloc-legend-item {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin-bottom: 0.3rem;
}
.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
  top: -1px;
}
.dot-p { background: var(--color-protein); }
.dot-f { background: var(--color-fat); }
.dot-c { background: var(--color-carbs); }
.alloc-label { font-size: var(--font-size-s); font-weight: var(--font-weight-bold); }
.label-p { color: var(--color-protein); }
.label-f { color: var(--color-fat); }
.label-c { color: var(--color-carbs); }
.alloc-spacer { flex: 1; }
.alloc-input {
  width: 52px;
  padding: 0.2rem 0.35rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.82rem;
  background: var(--bg);
  color: var(--text);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.alloc-input:focus { outline: none; border-color: var(--primary); }
.alloc-unit {
  font-size: 0.72rem;
  color: var(--text-secondary);
}
.alloc-computed {
  display: inline-block;
  width: 52px;
  text-align: right;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.alloc-detail {
  font-size: 0.72rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.error { color: var(--danger); font-size: var(--font-size-s); margin-bottom: 0.5rem; }
.success { color: var(--success); font-size: var(--font-size-s); margin-bottom: 0.5rem; }

/* Theme toggle */
.theme-toggle {
  display: inline-flex;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: 2px;
  gap: 2px;
}
.theme-option {
  padding: 0.35rem 0.8rem;
  background: none;
  border: none;
  border-radius: 4px;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.theme-option:hover { color: var(--text); }
.theme-option.active {
  background: var(--surface);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}
</style>
