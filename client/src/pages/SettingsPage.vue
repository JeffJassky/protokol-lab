<script setup>
import { ref, onMounted, computed, watch, reactive } from 'vue';
import { useSettingsStore } from '../stores/settings.js';
import { useCompoundsStore } from '../stores/compounds.js';
import { useDosesStore } from '../stores/doses.js';
import { usePushStore } from '../stores/push.js';
import { usePwa } from '../composables/usePwa.js';
import { useTheme } from '../composables/useTheme.js';
import InstallInstructions from '../components/InstallInstructions.vue';

const store = useSettingsStore();
const compoundsStore = useCompoundsStore();
const dosesStore = useDosesStore();
const pushStore = usePushStore();
const pwa = usePwa();
const theme = useTheme();

function nextDoseInfo(compound) {
  const last = dosesStore.latestDoseFor(compound._id);
  if (!last) return { label: 'No doses logged', status: 'none' };
  const interval = Number(compound.intervalDays) || 0;
  if (!interval) return { label: '—', status: 'none' };
  const lastDate = new Date(String(last.date).slice(0, 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(lastDate);
  next.setDate(next.getDate() + interval);
  const days = Math.round((next - today) / 86400000);
  if (days < 0) return { label: `${-days}d overdue`, status: 'overdue' };
  if (days === 0) return { label: 'Due today', status: 'today' };
  if (days === 1) return { label: 'Due tomorrow', status: 'upcoming' };
  return { label: `In ${days}d`, status: 'upcoming' };
}

// ---- Notifications ------------------------------------------------------
const trackReminderEnabled = ref(false);
const trackReminderTime = ref('20:00');
const notificationError = ref('');
const notificationSaving = ref(false);
const testSending = ref(false);
const testStatus = ref(''); // 'ok' | 'err' | ''

const notificationsBlockedByIos = computed(
  () => pwa.platform.value === 'ios' && !pwa.installed.value,
);

async function toggleNotifications() {
  notificationError.value = '';
  if (pushStore.enabled) {
    await pushStore.disable();
  } else {
    const ok = await pushStore.enable();
    if (!ok) notificationError.value = pushStore.error;
  }
}

async function saveTrackReminder() {
  notificationSaving.value = true;
  notificationError.value = '';
  try {
    await store.updateNotifications({
      trackReminder: {
        enabled: trackReminderEnabled.value,
        time: trackReminderTime.value,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch (err) {
    notificationError.value = err.message;
  } finally {
    notificationSaving.value = false;
  }
}

async function toggleCategory(category) {
  if (!pushStore.subscriptionDoc) return;
  const current = pushStore.subscriptionDoc.categories?.[category];
  await pushStore.setCategories({ [category]: !current });
}

async function sendTest() {
  testSending.value = true;
  testStatus.value = '';
  try {
    await pushStore.sendTest();
    testStatus.value = 'ok';
  } catch {
    testStatus.value = 'err';
  } finally {
    testSending.value = false;
    setTimeout(() => { testStatus.value = ''; }, 2500);
  }
}

const sex = ref('male');
const heightFeet = ref(5);
const heightInches = ref(10);
const currentWeightLbs = ref(180);
const goalWeightLbs = ref(170);
const bmr = ref('');
const calories = ref(2000);
const proteinGrams = ref(150);
const fatGrams = ref(65);
const carbsGrams = ref(200);

const saving = ref(false);
const saved = ref(false);
const error = ref('');
const hydrated = ref(false);

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

// ---- Compounds ----------------------------------------------------------

const KINETICS_SHAPES = [
  { value: 'bolus', label: 'Bolus', blurb: 'Instant peak, then exponential decay. IV-like or anything that hits peak almost immediately.' },
  { value: 'subq', label: 'Sub-Q', blurb: 'Rises over a few hours, then decays. Default for self-injected peptides.' },
  { value: 'depot', label: 'Depot', blurb: 'Slow release: lower peak, much longer tail. Long-acting weeklies and oil-based formulations.' },
];

// Mini sparkline path for the profile popover. Single dose, normalized to
// each shape's own peak so the silhouette differences (instant vs ramp vs
// slow rise) read clearly at small size.
function profileSparkline(shape) {
  const W = 96, H = 28, PAD = 2;
  const N = 64, tMax = 6;
  const halfLife = 1;
  const ke = Math.LN2 / halfLife;
  const ABS = { subq: 0.25, depot: 1 };
  const ka = shape === 'bolus' ? null : Math.LN2 / ABS[shape];
  const pts = [];
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * tMax;
    let y;
    if (shape === 'bolus') y = Math.exp(-ke * t);
    else if (Math.abs(ka - ke) < 1e-6) y = ke * t * Math.exp(-ke * t);
    else y = (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
    pts.push({ t, y });
  }
  const maxY = Math.max(...pts.map((p) => p.y)) || 1;
  return pts.map((p, i) => {
    const x = PAD + (p.t / tMax) * (W - 2 * PAD);
    const y = H - PAD - (p.y / maxY) * (H - 2 * PAD);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

const compoundDrafts = reactive({}); // id → { halfLifeDays, intervalDays, color, kineticsShape, ... }
const compoundSaveState = reactive({}); // id → 'saving' | 'saved' | 'error'
const newCompound = reactive({
  name: '',
  halfLifeDays: 6,
  intervalDays: 7,
  doseUnit: 'mg',
  color: '',
  kineticsShape: 'subq',
});
const compoundsError = ref('');

function startCompoundDraft(c) {
  compoundDrafts[c._id] = {
    halfLifeDays: c.halfLifeDays,
    intervalDays: c.intervalDays,
    color: c.color || '',
    kineticsShape: c.kineticsShape || 'subq',
    reminderEnabled: Boolean(c.reminderEnabled),
    reminderTime: c.reminderTime || '09:00',
  };
}

async function saveCompoundReminder(compound) {
  const draft = compoundDrafts[compound._id];
  if (!draft) return;
  compoundSaveState[compound._id] = 'saving';
  try {
    await compoundsStore.update(compound._id, {
      reminderEnabled: draft.reminderEnabled,
      reminderTime: /^\d{2}:\d{2}$/.test(draft.reminderTime) ? draft.reminderTime : '',
    });
    compoundSaveState[compound._id] = 'saved';
    setTimeout(() => { compoundSaveState[compound._id] = null; }, 1200);
  } catch (err) {
    compoundSaveState[compound._id] = 'error';
    compoundsError.value = err.message;
  }
}

function draftFor(id) {
  return compoundDrafts[id];
}

async function toggleCompoundEnabled(compound) {
  compoundsError.value = '';
  try {
    await compoundsStore.update(compound._id, { enabled: !compound.enabled });
  } catch (err) {
    compoundsError.value = err.message;
  }
}

async function saveCompoundDraft(compound) {
  const draft = compoundDrafts[compound._id];
  if (!draft) return;
  compoundSaveState[compound._id] = 'saving';
  try {
    await compoundsStore.update(compound._id, {
      halfLifeDays: Number(draft.halfLifeDays),
      intervalDays: Number(draft.intervalDays),
      color: draft.color,
      kineticsShape: draft.kineticsShape,
    });
    compoundSaveState[compound._id] = 'saved';
    setTimeout(() => { compoundSaveState[compound._id] = null; }, 1200);
  } catch (err) {
    compoundSaveState[compound._id] = 'error';
    compoundsError.value = err.message;
  }
}

async function handleDeleteCompound(compound) {
  compoundsError.value = '';
  if (!confirm(`Delete "${compound.name}"? All dose entries for this compound will be removed.`)) return;
  try {
    await compoundsStore.remove(compound._id);
    delete compoundDrafts[compound._id];
  } catch (err) {
    compoundsError.value = err.message;
  }
}

async function handleAddCompound() {
  compoundsError.value = '';
  if (!newCompound.name.trim()) return;
  try {
    const created = await compoundsStore.create({
      name: newCompound.name.trim(),
      halfLifeDays: Number(newCompound.halfLifeDays),
      intervalDays: Number(newCompound.intervalDays),
      doseUnit: newCompound.doseUnit,
      color: newCompound.color,
      kineticsShape: newCompound.kineticsShape,
    });
    startCompoundDraft(created);
    newCompound.name = '';
    newCompound.halfLifeDays = 6;
    newCompound.intervalDays = 7;
    newCompound.doseUnit = 'mg';
    newCompound.color = '';
    newCompound.kineticsShape = 'subq';
  } catch (err) {
    compoundsError.value = err.message;
  }
}

onMounted(async () => {
  if (!store.loaded) {
    await store.fetchSettings();
  }
  if (!compoundsStore.loaded) {
    await compoundsStore.fetchAll();
  }
  dosesStore.fetchEntries().catch(() => {});
  for (const c of compoundsStore.compounds) startCompoundDraft(c);
  if (store.settings) {
    const s = store.settings;
    sex.value = s.sex;
    heightFeet.value = Math.floor(s.heightInches / 12);
    heightInches.value = s.heightInches % 12;
    currentWeightLbs.value = s.currentWeightLbs;
    goalWeightLbs.value = s.goalWeightLbs || '';
    bmr.value = s.bmr || '';
    calories.value = s.targets.calories;
    proteinGrams.value = s.targets.proteinGrams;
    fatGrams.value = s.targets.fatGrams;
    carbsGrams.value = s.targets.carbsGrams;
    trackReminderEnabled.value = Boolean(s.trackReminder?.enabled);
    trackReminderTime.value = s.trackReminder?.time || '20:00';
  }
  hydrated.value = true;

  // Push subscription state — safe to call unconditionally; store guards
  // for unsupported browsers.
  pushStore.refreshPermission();
  if (pushStore.supported) {
    await pushStore.fetchVapidKey().catch(() => {});
    await pushStore.loadExistingSubscription();
    if (pushStore.enabled) await pushStore.fetchSubscriptions();
  }
});

async function persistSettings() {
  error.value = '';
  saving.value = true;
  try {
    await store.updateSettings({
      sex: sex.value,
      heightInches: totalHeightInches.value,
      currentWeightLbs: Number(currentWeightLbs.value),
      goalWeightLbs: goalWeightLbs.value ? Number(goalWeightLbs.value) : null,
      bmr: bmr.value ? Number(bmr.value) : null,
      targets: {
        calories: Number(calories.value),
        proteinGrams: Number(proteinGrams.value),
        fatGrams: Number(fatGrams.value),
        carbsGrams: Number(carbsGrams.value),
      },
    });
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 1500);
  } catch (err) {
    error.value = err.message;
  } finally {
    saving.value = false;
  }
}

let saveTimer = null;
function scheduleSave() {
  if (!hydrated.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistSettings, 600);
}

watch(
  [sex, heightFeet, heightInches, currentWeightLbs, goalWeightLbs, bmr,
   calories, proteinGrams, fatGrams, carbsGrams],
  scheduleSave,
);
</script>

<template>
  <div class="settings-page">
    <div class="settings-head">
      <h2>Settings</h2>
      <span v-if="saving" class="autosave-status">Saving…</span>
      <span v-else-if="saved" class="autosave-status ok">Saved</span>
    </div>

    <form @submit.prevent>
      <div class="card">
        <h3>Profile</h3>

        <div class="stat-grid">
          <label class="stat-cell">
            <span class="stat-label">Current</span>
            <span class="stat-value-wrap">
              <input type="number" v-model.number="currentWeightLbs" step="0.1" required class="stat-input" />
              <span class="stat-unit">lbs</span>
            </span>
          </label>
          <label class="stat-cell">
            <span class="stat-label">Goal</span>
            <span class="stat-value-wrap">
              <input type="number" v-model.number="goalWeightLbs" step="0.1" class="stat-input" placeholder="—" />
              <span class="stat-unit">lbs</span>
            </span>
          </label>
          <label class="stat-cell">
            <span class="stat-label">BMR</span>
            <span class="stat-value-wrap">
              <input type="number" v-model.number="bmr" step="1" class="stat-input" placeholder="—" />
              <span class="stat-unit">kcal/day</span>
            </span>
          </label>
        </div>

        <div class="bio-row">
          <div class="bio-group">
            <span class="bio-label">Sex</span>
            <div class="seg-control">
              <button type="button" class="seg-btn" :class="{ active: sex === 'male' }" @click="sex = 'male'">Male</button>
              <button type="button" class="seg-btn" :class="{ active: sex === 'female' }" @click="sex = 'female'">Female</button>
            </div>
          </div>
          <div class="bio-group">
            <span class="bio-label">Height</span>
            <div class="bio-inline">
              <input type="number" v-model.number="heightFeet" min="3" max="8" class="bio-input" />
              <span class="bio-unit">ft</span>
              <input type="number" v-model.number="heightInches" min="0" max="11" class="bio-input" />
              <span class="bio-unit">in</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <h3>Daily Targets</h3>

        <div class="cal-hero">
          <label class="cal-hero-main">
            <span class="cal-hero-label">Calories / day</span>
            <input
              id="calories"
              type="number"
              v-model.number="calories"
              min="400"
              step="50"
              required
              class="cal-hero-input"
            />
          </label>
          <div v-if="calorieDelta != null" class="cal-hero-aside">
            <div class="cal-stat">
              <span class="cal-stat-label">vs BMR</span>
              <span class="cal-stat-value" :class="calorieDelta < 0 ? 'neg' : 'pos'">
                {{ signed(calorieDelta) }}
                <span class="cal-stat-unit">kcal</span>
              </span>
            </div>
            <div class="cal-stat">
              <span class="cal-stat-label">Projected</span>
              <span class="cal-stat-value" :class="weeklyLbs < 0 ? 'neg' : 'pos'">
                {{ signed(weeklyLbs, 2) }}
                <span class="cal-stat-unit">lbs/wk</span>
              </span>
            </div>
          </div>
          <p v-else class="cal-hero-hint">Set BMR in Profile to see deficit + projected weekly change.</p>
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
    </form>

    <div class="card">
      <h3>Compounds</h3>
      <p class="field-hint" style="margin-bottom: 0.75rem">
        Compounds you dose on a schedule. System entries can be enabled or disabled; custom ones are fully editable.
      </p>
      <ul class="compound-list">
        <li
          v-for="c in compoundsStore.compounds"
          :key="c._id"
          class="compound-row"
          :class="{ disabled: !c.enabled }"
          :style="c.enabled && c.color ? { borderLeftColor: c.color, borderLeftWidth: '3px' } : null"
        >
          <div class="compound-lead">
            <label class="compound-enable" :title="c.enabled ? 'Disable' : 'Enable'">
              <input
                type="checkbox"
                :checked="c.enabled"
                @change.stop="toggleCompoundEnabled(c)"
                @click.stop
              />
              <span class="compound-swatch" :style="{ background: c.color || 'var(--border)' }" />
            </label>
            <div class="compound-identity">
              <div class="compound-name-row">
                <span class="compound-name">{{ c.name }}</span>
                <svg
                  v-if="c.isSystem"
                  class="compound-lock"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-label="System compound"
                >
                  <rect x="4" y="11" width="16" height="9" rx="0" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </div>
              <span
                v-if="c.enabled"
                class="compound-next"
                :class="`status-${nextDoseInfo(c).status}`"
              >{{ nextDoseInfo(c).label }}</span>
              <span v-else class="compound-next muted">Disabled</span>
            </div>
            <button
              v-if="!c.isSystem"
              type="button"
              class="compound-del"
              @click.stop="handleDeleteCompound(c)"
              title="Delete compound"
            >×</button>
          </div>
          <div v-if="draftFor(c._id) && c.enabled" class="compound-params">
            <label class="param-chip">
              <span class="param-label">Half-life</span>
              <input
                type="number"
                step="0.25"
                min="0.1"
                v-model.number="draftFor(c._id).halfLifeDays"
                @change="saveCompoundDraft(c)"
              />
              <span class="param-unit">d</span>
            </label>
            <label class="param-chip">
              <span class="param-label">Interval</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                v-model.number="draftFor(c._id).intervalDays"
                @change="saveCompoundDraft(c)"
              />
              <span class="param-unit">d</span>
            </label>
            <VDropdown
              :triggers="['hover', 'focus']"
              :popper-triggers="['hover']"
              :delay="{ show: 200, hide: 100 }"
              placement="bottom-start"
              :distance="6"
            >
              <div class="param-chip shape-chip">
                <span class="param-label">Profile</span>
                <select
                  v-model="draftFor(c._id).kineticsShape"
                  @change="saveCompoundDraft(c)"
                >
                  <option v-for="s in KINETICS_SHAPES" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
              </div>
              <template #popper>
                <div class="popover profile-pop">
                  <h4 class="profile-pop-title">PK profile</h4>
                  <p class="profile-pop-lede">
                    Half-life sets how fast the dose clears. The profile sets how
                    it gets there — instant peak vs. gradual rise from absorption.
                  </p>
                  <ul class="profile-pop-list">
                    <li v-for="s in KINETICS_SHAPES" :key="s.value">
                      <svg class="profile-spark" viewBox="0 0 96 28" preserveAspectRatio="none" aria-hidden="true">
                        <path :d="profileSparkline(s.value)" fill="none" stroke="currentColor" stroke-width="1.5" />
                      </svg>
                      <div class="profile-pop-name">{{ s.label }}</div>
                      <div class="profile-pop-blurb">{{ s.blurb }}</div>
                    </li>
                  </ul>
                  <p class="profile-pop-hint">
                    Not sure which fits {{ c.name }}? Ask the chat assistant —
                    it has your full compound + dose context.
                  </p>
                </div>
              </template>
            </VDropdown>
            <div class="param-chip static">
              <span class="param-label">Unit</span>
              <span class="param-static-val">{{ c.doseUnit }}</span>
            </div>
            <label class="param-chip color-chip">
              <span class="param-label">Color</span>
              <input
                type="color"
                v-model="draftFor(c._id).color"
                @change="saveCompoundDraft(c)"
              />
            </label>
            <span
              v-if="compoundSaveState[c._id] === 'saved'"
              class="compound-status ok"
            >saved</span>
            <span
              v-else-if="compoundSaveState[c._id] === 'saving'"
              class="compound-status"
            >saving...</span>
          </div>

          <!-- Dose reminders (per-compound) -->
          <div v-if="draftFor(c._id) && c.enabled" class="compound-reminder">
            <label class="switch" :title="draftFor(c._id).reminderEnabled ? 'Reminder on' : 'Reminder off'">
              <input
                type="checkbox"
                v-model="draftFor(c._id).reminderEnabled"
                @change="saveCompoundReminder(c)"
              />
              <span class="switch-track"><span class="switch-thumb" /></span>
            </label>
            <span class="reminder-inline-label">Remind on dose days at</span>
            <input
              type="time"
              class="reminder-time"
              v-model="draftFor(c._id).reminderTime"
              :disabled="!draftFor(c._id).reminderEnabled"
              @change="saveCompoundReminder(c)"
            />
          </div>
        </li>
      </ul>

      <div class="compound-add">
        <h4>Add custom compound</h4>
        <div class="compound-add-grid">
          <label class="compound-field">
            <span>Name</span>
            <input type="text" v-model="newCompound.name" placeholder="e.g. Ipamorelin" />
          </label>
          <label class="compound-field">
            <span>Half-life (days)</span>
            <input type="number" step="0.25" min="0.1" v-model.number="newCompound.halfLifeDays" />
          </label>
          <label class="compound-field">
            <span>Interval (days)</span>
            <input type="number" step="0.5" min="0.5" v-model.number="newCompound.intervalDays" />
          </label>
          <label class="compound-field">
            <span>Unit</span>
            <select v-model="newCompound.doseUnit">
              <option value="mg">mg</option>
              <option value="mcg">mcg</option>
              <option value="iu">iu</option>
              <option value="ml">ml</option>
            </select>
          </label>
          <label class="compound-field">
            <span>Shape</span>
            <select v-model="newCompound.kineticsShape">
              <option v-for="s in KINETICS_SHAPES" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </label>
          <label class="compound-field small">
            <span>Color</span>
            <input type="color" v-model="newCompound.color" />
          </label>
        </div>
        <button type="button" class="btn-secondary" @click="handleAddCompound">Add compound</button>
      </div>
      <p v-if="compoundsError" class="error">{{ compoundsError }}</p>
    </div>

    <!-- Notifications --------------------------------------------------- -->
    <div class="card">
      <h3>Notifications</h3>

      <div v-if="!pushStore.supported" class="notif-note">
        Push notifications aren't supported in this browser.
      </div>
      <div v-else-if="!pushStore.serverEnabled" class="notif-note warn">
        Server push is not configured. Run
        <code>node src/scripts/generate-vapid.js</code> and add the keys to
        <code>server/.env</code>, then restart the server.
      </div>
      <template v-else>
        <div v-if="!pwa.installed.value" class="notif-install">
          <p class="notif-lead">
            <template v-if="notificationsBlockedByIos">
              On iPhone and iPad, push notifications only work when the app is
              installed to your home screen.
            </template>
            <template v-else>
              Install the app for the most reliable delivery.
            </template>
          </p>
          <InstallInstructions />
        </div>

        <!-- Device status hero -->
        <div class="notif-hero" :class="{ on: pushStore.enabled, blocked: pushStore.permission === 'denied' }">
          <div class="notif-hero-main">
            <span class="notif-hero-ind" />
            <div class="notif-hero-text">
              <div class="notif-hero-state">
                <template v-if="pushStore.enabled">Active on this device</template>
                <template v-else-if="pushStore.permission === 'denied'">Blocked by browser</template>
                <template v-else>Not enabled</template>
              </div>
              <div class="notif-hero-sub">
                <template v-if="pushStore.enabled">Push reminders will be delivered here.</template>
                <template v-else-if="pushStore.permission === 'denied'">Re-enable notifications in your device settings.</template>
                <template v-else>Turn on to receive dose and tracking reminders.</template>
              </div>
            </div>
          </div>
          <button
            type="button"
            class="notif-hero-btn"
            :class="{ on: pushStore.enabled }"
            :disabled="pushStore.loading || notificationsBlockedByIos"
            @click="toggleNotifications"
          >
            {{ pushStore.enabled ? 'Turn off' : 'Enable' }}
          </button>
        </div>

        <template v-if="pushStore.enabled">
          <div class="notif-section-label">Categories</div>
          <div class="notif-categories">
            <label class="notif-cat">
              <input
                type="checkbox"
                :checked="pushStore.subscriptionDoc?.categories?.doseReminder !== false"
                @change="toggleCategory('doseReminder')"
              />
              <span>Dose reminders</span>
              <span class="notif-cat-sub">Triggered by each compound's schedule below.</span>
            </label>
            <label class="notif-cat">
              <input
                type="checkbox"
                :checked="pushStore.subscriptionDoc?.categories?.trackReminder !== false"
                @change="toggleCategory('trackReminder')"
              />
              <span>Daily tracking reminder</span>
              <span class="notif-cat-sub">Evening nudge if you haven't logged yet.</span>
            </label>
          </div>

          <div class="notif-test-row">
            <button
              type="button"
              class="btn-secondary"
              :disabled="testSending"
              @click="sendTest"
            >
              {{ testSending ? 'Sending…' : 'Send test notification' }}
            </button>
            <span v-if="testStatus === 'ok'" class="notif-success">Sent — check your device.</span>
            <span v-else-if="testStatus === 'err'" class="notif-err">Failed. Check logs.</span>
          </div>
        </template>

        <p v-if="notificationError || pushStore.error" class="error">
          {{ notificationError || pushStore.error }}
        </p>
      </template>
    </div>

    <!-- Daily tracking reminder ---------------------------------------- -->
    <div
      v-if="pushStore.supported && pushStore.serverEnabled"
      class="card"
    >
      <h3>Daily tracking</h3>
      <p class="track-lead">
        Evening nudge if you haven't logged weight, meals, symptoms, or a dose that day.
      </p>
      <div class="track-row" :class="{ disabled: !pushStore.enabled }">
        <label class="track-toggle">
          <input type="checkbox" v-model="trackReminderEnabled" :disabled="!pushStore.enabled" />
          <span>Remind me at</span>
        </label>
        <input
          type="time"
          v-model="trackReminderTime"
          :disabled="!trackReminderEnabled || !pushStore.enabled"
          class="track-time"
        />
        <button
          type="button"
          class="btn-secondary sm"
          :disabled="notificationSaving || !pushStore.enabled"
          @click="saveTrackReminder"
        >
          {{ notificationSaving ? 'Saving…' : 'Save' }}
        </button>
      </div>
      <p v-if="!pushStore.enabled" class="track-hint">Enable notifications above to activate this reminder.</p>
    </div>

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
  </div>
</template>

<style scoped>
.settings-page { max-width: 560px; }
.settings-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.settings-head h2 { margin: 0; }
.autosave-status {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}
.autosave-status.ok { color: var(--success); }
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
  margin-bottom: var(--space-4);
}

/* ---- Profile: stat-card led ------------------------------------------- */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.stat-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  padding: var(--space-3);
  background: var(--bg);
  border: 1px solid var(--border);
  cursor: text;
  transition: border-color var(--transition-fast);
}
.stat-cell:focus-within { border-color: var(--primary); }
.stat-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.stat-value-wrap {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
}
.stat-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}
.stat-input::placeholder { color: var(--text-disabled); font-weight: var(--font-weight-light); }
.stat-unit {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-medium);
}

.bio-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-4);
  align-items: center;
}
.bio-group { display: flex; align-items: center; gap: var(--space-2); }
.bio-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.seg-control {
  display: inline-flex;
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 2px;
  gap: 2px;
}
.seg-btn {
  padding: 0.25rem 0.65rem;
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
.bio-inline { display: inline-flex; align-items: baseline; gap: var(--space-1); }
.bio-input {
  width: 48px;
  padding: 0.25rem 0.35rem;
  text-align: right;
  font-size: var(--font-size-s);
  font-variant-numeric: tabular-nums;
}
.bio-unit { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-right: var(--space-1); }

/* ---- Daily Targets: hero calories + stat asides ----------------------- */
.cal-hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-4);
  align-items: end;
  padding: var(--space-4);
  background: var(--bg);
  border: 1px solid var(--border);
  margin-bottom: var(--space-5);
}
.cal-hero-main { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.cal-hero-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.cal-hero-input {
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  width: 100%;
}
.cal-hero-aside {
  display: flex;
  gap: var(--space-4);
  align-items: stretch;
  padding-left: var(--space-4);
  border-left: 1px solid var(--border);
}
.cal-stat { display: flex; flex-direction: column; gap: var(--space-1); }
.cal-stat-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.cal-stat-value {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  color: var(--text);
}
.cal-stat-value.neg { color: var(--danger); }
.cal-stat-value.pos { color: var(--success); }
.cal-stat-unit { font-size: var(--font-size-xs); color: var(--text-tertiary); font-weight: var(--font-weight-medium); margin-left: 2px; }
.cal-hero-hint {
  grid-column: 1 / -1;
  margin: 0;
  padding-top: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
/* Macro allocation bar — single bar, two draggable handles */
.alloc-bar {
  position: relative;
  display: flex;
  height: 32px;
  border-radius: var(--radius-small);
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
.seg-p { background: var(--color-protein); }
.seg-f { background: var(--color-fat); }
.seg-c { background: var(--color-carbs); }

.handle {
  position: absolute;
  top: 50%;
  width: 6px;
  height: 40px;
  margin-left: -3px;
  margin-top: -20px;
  background: var(--surface);
  border: 2px solid var(--border-strong);
  border-radius: var(--radius-small);
  cursor: ew-resize;
  z-index: 2;
  box-shadow: var(--shadow-s);
  transition: border-color var(--transition-fast);
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
  font-size: var(--font-size-s);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.alloc-unit {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.alloc-computed {
  display: inline-block;
  width: 52px;
  text-align: right;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.alloc-detail {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.error { color: var(--danger); font-size: var(--font-size-s); margin-bottom: 0.5rem; }
.success { color: var(--success); font-size: var(--font-size-s); margin-bottom: 0.5rem; }

/* ---- Compounds -------------------------------------------------------- */
.compound-list {
  list-style: none;
  margin: 0 0 var(--space-4);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.compound-row {
  border: 1px solid var(--border);
  border-left: 3px solid var(--border);
  background: var(--bg);
  padding: var(--space-3) var(--space-4);
  transition: border-color var(--transition-fast);
}
.compound-row.disabled { opacity: 0.6; }
.compound-row.disabled .compound-swatch { background: var(--border) !important; }

.compound-lead {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-3);
  align-items: center;
}
.compound-enable {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}
.compound-enable input[type="checkbox"] { accent-color: var(--primary); cursor: pointer; }
.compound-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  flex-shrink: 0;
}

.compound-identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.compound-name-row { display: inline-flex; align-items: center; gap: var(--space-1); }
.compound-name {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  letter-spacing: var(--tracking-tight);
}
.compound-lock {
  width: 11px;
  height: 11px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.compound-next {
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}
.compound-next.status-overdue { color: var(--danger); font-weight: var(--font-weight-bold); }
.compound-next.status-today { color: var(--warning); font-weight: var(--font-weight-bold); }
.compound-next.status-upcoming { color: var(--text-secondary); }
.compound-next.status-none { color: var(--text-tertiary); font-style: italic; }
.compound-next.muted { color: var(--text-tertiary); }

.compound-del {
  width: 24px;
  height: 24px;
  background: none;
  border: 1px solid transparent;
  color: var(--text-tertiary);
  font-size: var(--font-size-l);
  line-height: 1;
  cursor: pointer;
  padding: 0;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}
.compound-del:hover { color: var(--danger); border-color: var(--danger); }

.compound-params {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--border);
  align-items: center;
}
.param-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: var(--font-size-xs);
}
.param-chip:focus-within { border-color: var(--primary); }
.param-label {
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: var(--font-weight-bold);
}
.param-chip input[type="number"] {
  width: 48px;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.param-unit { color: var(--text-tertiary); font-size: var(--font-size-xs); }
.param-static-val {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
}
.color-chip { padding: 2px 6px; }
.color-chip input[type="color"] {
  width: 22px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
}

.shape-chip select {
  background: transparent;
  border: none;
  outline: none;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  cursor: pointer;
}

/* PK profile educational popover */
.profile-pop {
  width: 340px;
  padding: var(--space-4);
  background: var(--surface-raised);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--font-size-s);
  line-height: 1.5;
  box-shadow: var(--shadow-m);
}
.profile-pop-title {
  font-family: var(--font-display);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  margin: 0 0 var(--space-2);
}
.profile-pop-lede {
  margin: 0 0 var(--space-4);
  color: var(--text-secondary);
  font-size: var(--font-size-s);
}
.profile-pop-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.profile-pop-list li {
  display: grid;
  grid-template-columns: 56px 1fr;
  grid-template-rows: auto auto;
  column-gap: var(--space-3);
  row-gap: 2px;
  align-items: center;
}
.profile-spark {
  grid-row: 1 / span 2;
  width: 56px;
  height: 28px;
  color: var(--primary);
  display: block;
}
.profile-pop-name {
  font-family: var(--font-display);
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-s);
  color: var(--text);
  letter-spacing: var(--tracking-tight);
}
.profile-pop-blurb {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.45;
}
.profile-pop-hint {
  margin: 0;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  line-height: 1.5;
}

.compound-status { font-size: var(--font-size-xs); color: var(--text-tertiary); margin-left: auto; }
.compound-status.ok { color: var(--success); }

.compound-add {
  border-top: 1px dashed var(--border);
  padding-top: var(--space-3);
  margin-top: var(--space-2);
}
.compound-add h4 {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin: 0 0 var(--space-2);
}
.compound-add-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-3);
  align-items: flex-end;
  margin-bottom: var(--space-2);
}
.compound-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.compound-field > span {
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  font-weight: var(--font-weight-bold);
}
.compound-field input[type="number"],
.compound-field input[type="text"],
.compound-field select {
  padding: 0.3rem 0.5rem;
  background: var(--surface);
  font-size: var(--font-size-s);
  width: 110px;
}
.compound-field.small input,
.compound-field.small select { width: 56px; }
.compound-field input[type="color"] {
  width: 40px;
  height: 28px;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

/* ---- Notifications ---------------------------------------------------- */
.notif-note {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  padding: var(--space-2) 0;
}
.notif-note.warn { color: var(--warning, var(--text-secondary)); }
.notif-note code {
  background: var(--bg);
  padding: 0.05rem 0.25rem;
  font-size: var(--font-size-s);
}
.notif-install {
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-3);
  border-bottom: 1px dashed var(--border);
}
.notif-lead { margin: 0 0 var(--space-2); font-size: var(--font-size-s); color: var(--text); }

/* Device status hero */
.notif-hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-4);
  background: var(--bg);
  border: 1px solid var(--border);
  border-left: 3px solid var(--border-strong);
  margin-bottom: var(--space-4);
}
.notif-hero.on { border-left-color: var(--primary); }
.notif-hero.blocked { border-left-color: var(--danger); }
.notif-hero-main { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.notif-hero-ind {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-strong);
  flex: none;
  box-shadow: 0 0 0 3px var(--bg);
}
.notif-hero.on .notif-hero-ind {
  background: var(--success);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.notif-hero.blocked .notif-hero-ind { background: var(--danger); }
.notif-hero-text { min-width: 0; }
.notif-hero-state {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  letter-spacing: var(--tracking-tight);
}
.notif-hero-sub {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-top: 2px;
}
.notif-hero-btn {
  padding: 0.45rem 1rem;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.notif-hero-btn:hover { border-color: var(--text-secondary); }
.notif-hero-btn.on {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--text-on-primary);
}
.notif-hero-btn.on:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
.notif-hero-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.notif-section-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin-bottom: var(--space-2);
}

.notif-categories {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.notif-cat {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: baseline;
  gap: 2px var(--space-2);
  font-size: var(--font-size-s);
  color: var(--text);
  cursor: pointer;
}
.notif-cat input[type="checkbox"] { grid-row: 1 / span 2; align-self: start; margin-top: 3px; accent-color: var(--primary); }
.notif-cat-sub { grid-column: 2; font-size: var(--font-size-xs); color: var(--text-tertiary); }

.notif-test-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--border);
  flex-wrap: wrap;
}
.notif-success { color: var(--success); font-size: var(--font-size-s); }
.notif-err { color: var(--danger); font-size: var(--font-size-s); }

/* ---- Daily tracking card --------------------------------------------- */
.track-lead {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  line-height: 1.45;
}
.track-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-3);
  background: var(--bg);
  border: 1px solid var(--border);
  transition: opacity var(--transition-fast);
}
.track-row.disabled { opacity: 0.55; }
.track-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-s);
  color: var(--text);
  cursor: pointer;
}
.track-toggle input { accent-color: var(--primary); }
.track-time {
  padding: 0.3rem 0.5rem;
  font-size: var(--font-size-s);
  font-variant-numeric: tabular-nums;
}
.track-time:disabled { opacity: 0.5; }
.track-hint {
  margin: var(--space-2) 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

/* Per-compound reminder block */
.compound-reminder {
  margin-top: 0.5rem;
  border-top: 1px dashed var(--border);
  padding-top: 0.6rem;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
}
.reminder-inline-label {
  color: var(--text);
  font-weight: var(--font-weight-medium);
}
.reminder-inline-hint {
  font-size: var(--font-size-xs);
}
.reminder-time {
  padding: 0.3rem 0.45rem;
  font-size: var(--font-size-s);
}
.reminder-time:disabled { opacity: 0.5; }

/* Toggle switch */
.switch {
  position: relative;
  display: inline-flex;
  width: 36px;
  height: 20px;
  flex: none;
  cursor: pointer;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}
.switch-track {
  position: absolute;
  inset: 0;
  background: var(--border);
  border-radius: var(--radius-pill);
  transition: background var(--transition-fast);
}
.switch-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: var(--surface);
  border-radius: 50%;
  transition: transform var(--transition-fast);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}
.switch input:checked + .switch-track { background: var(--primary); }
.switch input:checked + .switch-track .switch-thumb { transform: translateX(16px); }

/* Theme toggle — segmented control */
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
  border-radius: var(--radius-small);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.theme-option:hover { color: var(--text); }
.theme-option.active {
  background: var(--surface);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}
</style>
