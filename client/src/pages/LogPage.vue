<script setup>
import { ref, watch, onMounted, computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFoodLogStore } from '../stores/foodlog.js';
import { useMealsStore } from '../stores/meals.js';
import { useUpgradeModalStore } from '../stores/upgradeModal.js';
import { usePlanLimits } from '../composables/usePlanLimits.js';
import { useSymptomsStore } from '../stores/symptoms.js';
import { useMetricsStore } from '../stores/metrics.js';
import { usePhotoTypesStore } from '../stores/photoTypes.js';
import {
  defaultUnitFor,
  unitLabel,
  toCanonical,
  fromCanonical,
} from '../../../shared/units.js';
import { useNotesStore } from '../stores/notes.js';
import { useWeightStore } from '../stores/weight.js';
import { useWaterStore, mlToUnit } from '../stores/water.js';
import { useCompoundsStore } from '../stores/compounds.js';
import { useDosesStore } from '../stores/doses.js';
import { useSettingsStore } from '../stores/settings.js';
import { usePhotosStore } from '../stores/photos.js';
import DateSelector from '../components/DateSelector.vue';
import DailySummary from '../components/DailySummary.vue';
import DatePickerModal from '../components/DatePickerModal.vue';
import FoodItemEditModal from '../components/FoodItemEditModal.vue';
import WeeklyBudgetStrip from '../components/WeeklyBudgetStrip.vue';
import PhotoCaptureCard from '../components/PhotoCaptureCard.vue';
import UpgradeBadge from '../components/UpgradeBadge.vue';
import FastingBanner from '../components/FastingBanner.vue';
import { localYmd } from '../utils/date.js';

const route = useRoute();
const router = useRouter();
const foodlogStore = useFoodLogStore();
const mealsStore = useMealsStore();
const upgradeModal = useUpgradeModalStore();
const planLimits = usePlanLimits();

const rolling7DayUpgradeTier = computed(() => {
  const target = planLimits.planRequiredFor({ feature: 'rolling7DayTargets' });
  return target?.id || null;
});

// Advanced symptom analytics: paid tiers get the full 0-10 severity scale.
// Free tier sees a binary present/absent toggle (0 + 1). Existing data with
// severity >2 still displays under binary view as "active" via isDotActive.
const hasAdvancedSymptoms = computed(() =>
  planLimits.hasFeature('advancedSymptomAnalytics'),
);
const symptomsUpgradeTier = computed(() => {
  const target = planLimits.planRequiredFor({ feature: 'advancedSymptomAnalytics' });
  return target?.id || null;
});
const symptomsStore = useSymptomsStore();
const metricsStore = useMetricsStore();
const photoTypesStore = usePhotoTypesStore();
const notesStore = useNotesStore();
const weightStore = useWeightStore();
const waterStore = useWaterStore();
const compoundsStore = useCompoundsStore();
const dosesStore = useDosesStore();
const settingsStore = useSettingsStore();
const photosStore = usePhotosStore();

const date = ref(route.query.date || localYmd());
const editingId = ref(null);
const editServings = ref(1);

// Inline submenu expansion within the "..." menu (VDropdown handles open/close).
const openSubmenu = ref(null); // null | 'addToMeal'
// Collapsed meal groups keyed by `${mealType}:${mealId}`.
const collapsedGroups = reactive(new Set());

// Date picker modal state for Copy/Move actions.
const pickerOpen = ref(false);
const pickerMode = ref('copy');
const pickerTargetIds = ref([]);
const pickerTitle = ref('');

// Food item edit modal state.
const editFoodItem = ref(null);
const editModalOpen = ref(false);

function openEditModal(entry) {
  editFoodItem.value = entry.foodItemId;
  editModalOpen.value = true;
}

async function handleEditSaved() {
  editModalOpen.value = false;
  editFoodItem.value = null;
  await foodlogStore.loadDay(date.value);
}

// Weight + dose form state. Both forms write to the page's currently-selected
// date so logging is implicit — no per-form date picker required.
const newWeight = ref('');
const savingWeight = ref(false);
const weightInputFocused = ref(false);
const doseInputFocused = reactive({});
// Dose inputs are keyed by compoundId since the user may have multiple compounds.
const newDoseByCompound = reactive({});
const savingDoseByCompound = reactive({});

// Metric input state, keyed by metricId. Values typed in display units; only
// converted to canonical at save time so the user sees what they typed.
const newMetricByMetric = reactive({});
const savingMetricByMetric = reactive({});
const metricInputFocused = reactive({});

const unitSystem = computed(() => settingsStore.settings?.unitSystem || 'imperial');

const enabledMetrics = computed(() =>
  metricsStore.metrics.filter((m) => m.enabled).sort((a, b) => a.order - b.order),
);

function metricDisplayUnit(metric) {
  return metric.displayUnit || defaultUnitFor(metric.dimension, unitSystem.value);
}

function metricDisplayValue(metric) {
  const log = metricsStore.logsByMetric[metric._id];
  if (!log) return null;
  const unit = metricDisplayUnit(metric);
  const v = fromCanonical(log.value, unit);
  // Trim to a sensible number of decimals — same heuristic as
  // shared/units.js defaultDecimals: lengths/masses get 1, counts get 0.
  const decimals = ['cm', 'in', 'mm', 'm', 'ft', 'kg', 'lb'].includes(unit) ? 1 : 0;
  return Number.isFinite(v) ? v.toFixed(decimals) : null;
}

async function handleAddMetric(metric) {
  const raw = newMetricByMetric[metric._id];
  if (raw === '' || raw == null || Number.isNaN(Number(raw))) return;
  savingMetricByMetric[metric._id] = true;
  try {
    const unit = metricDisplayUnit(metric);
    const canonical = toCanonical(Number(raw), unit);
    await metricsStore.setValue(metric._id, canonical);
    newMetricByMetric[metric._id] = '';
  } finally {
    savingMetricByMetric[metric._id] = false;
  }
}

async function handleDeleteMetric(metric) {
  await metricsStore.setValue(metric._id, null);
}

const mealTypes = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];

async function loadAllForDate(d) {
  await Promise.all([
    foodlogStore.loadDay(d),
    symptomsStore.fetchLogsForDate(d),
    metricsStore.fetchLogsForDate(d),
    notesStore.fetchForDate(d),
    waterStore.fetchDay(d),
  ]);
  noteDraft.value = notesStore.text;
}

onMounted(async () => {
  await Promise.all([
    loadAllForDate(date.value),
    mealsStore.fetchMeals(),
    symptomsStore.fetchSymptoms(),
    metricsStore.fetchMetrics(),
    weightStore.fetchEntries(),
    compoundsStore.fetchAll(),
    dosesStore.fetchEntries(),
    photosStore.fetchAll(),
    photoTypesStore.fetchPhotoTypes(),
    settingsStore.loaded ? Promise.resolve() : settingsStore.fetchSettings(),
  ]);
});

watch(date, async (val) => {
  router.replace({ query: { date: val } });
  await loadAllForDate(val);
});

// ---- Food log helpers ---------------------------------------------------

function entryNutrition(entry) {
  const food = entry.foodItemId;
  if (!food) return { cal: 0, p: 0, f: 0, c: 0 };
  const ps = food.perServing || {};
  const s = entry.servingCount;
  return {
    cal: Math.round((ps.calories || 0) * s),
    p: Math.round((ps.protein || 0) * s),
    f: Math.round((ps.fat || 0) * s),
    c: Math.round((ps.carbs || 0) * s),
  };
}

function sumNutrition(entries) {
  return entries.reduce(
    (acc, e) => {
      const n = entryNutrition(e);
      acc.cal += n.cal;
      acc.p += n.p;
      acc.f += n.f;
      acc.c += n.c;
      return acc;
    },
    { cal: 0, p: 0, f: 0, c: 0 },
  );
}

function groupEntries(entries) {
  const rows = [];
  const groupIndex = new Map();
  for (const entry of entries) {
    const mealId = entry.mealId?._id || entry.mealId;
    if (mealId) {
      const key = String(mealId);
      if (groupIndex.has(key)) {
        rows[groupIndex.get(key)].entries.push(entry);
      } else {
        groupIndex.set(key, rows.length);
        rows.push({
          type: 'group',
          mealId: key,
          mealName: entry.mealId?.name || 'Meal',
          mealEmoji: entry.mealId?.emoji || '',
          entries: [entry],
        });
      }
    } else {
      rows.push({ type: 'entry', entry });
    }
  }
  return rows;
}

// ---- Sorting ---------------------------------------------------------------

const sortKey = ref(null); // null | 'cal' | 'p' | 'f' | 'c'
const sortDir = ref('desc'); // 'asc' | 'desc'

function toggleSort(key) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc';
  } else {
    sortKey.value = key;
    sortDir.value = 'desc';
  }
}

function sortIndicator(key) {
  if (sortKey.value !== key) return '';
  return sortDir.value === 'desc' ? ' ▾' : ' ▴';
}

function sortEntries(entries) {
  if (!sortKey.value) return entries;
  const k = sortKey.value;
  const dir = sortDir.value === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => (entryNutrition(a)[k] - entryNutrition(b)[k]) * dir);
}

function rowNutrition(row) {
  if (row.type === 'entry') return entryNutrition(row.entry);
  return sumNutrition(row.entries);
}

function sortRows(rows) {
  if (!sortKey.value) return rows;
  const k = sortKey.value;
  const dir = sortDir.value === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => (rowNutrition(a)[k] - rowNutrition(b)[k]) * dir);
}

const groupedBySlot = computed(() => {
  const out = {};
  for (const meal of mealTypes) {
    out[meal.key] = sortRows(groupEntries(foodlogStore.entries[meal.key] || []));
  }
  return out;
});

// Meal type sections ordered by group total when sorting is active.
const orderedMealTypes = computed(() => {
  if (!sortKey.value) return mealTypes;
  const k = sortKey.value;
  const dir = sortDir.value === 'desc' ? -1 : 1;
  return [...mealTypes].sort((a, b) => {
    const aTotal = sumNutrition(foodlogStore.entries[a.key] || [])[k];
    const bTotal = sumNutrition(foodlogStore.entries[b.key] || [])[k];
    return (aTotal - bTotal) * dir;
  });
});

function isCollapsed(mealType, mealId) {
  return collapsedGroups.has(`${mealType}:${mealId}`);
}
function toggleCollapsed(mealType, mealId) {
  const key = `${mealType}:${mealId}`;
  if (collapsedGroups.has(key)) collapsedGroups.delete(key);
  else collapsedGroups.add(key);
}

function startEdit(entry) {
  editingId.value = entry._id;
  editServings.value = entry.servingCount;
}

async function saveEdit(id) {
  const count = Number(editServings.value);
  if (count === 0) {
    await foodlogStore.deleteEntry(id);
  } else {
    await foodlogStore.updateEntry(id, { servingCount: count });
  }
  editingId.value = null;
}

function cancelEdit() {
  editingId.value = null;
}

function addFood(mealType) {
  router.push(`/food/search?meal=${mealType}&date=${date.value}`);
}

// ---- "..." flyout -------------------------------------------------------

async function handleDelete(entry) {
  await foodlogStore.deleteEntry(entry._id);
}

async function handleDeleteGroup(mealType, group) {
  if (!confirm(`Remove all ${group.entries.length} items from "${group.mealName}"?`)) return;
  for (const entry of group.entries) {
    // eslint-disable-next-line no-await-in-loop
    await foodlogStore.deleteEntry(entry._id);
  }
}

async function addEntryToMeal(entry, mealId) {
  const foodItemId = entry.foodItemId?._id;
  if (!foodItemId) return;
  await mealsStore.addItem(mealId, foodItemId, entry.servingCount);
}

async function addEntryToNewMeal(entry) {
  // Pre-flight cap check before prompting for a name — gives a clean upsell
  // path instead of showing the prompt and then failing with a 403.
  if (!planLimits.canAddStorage('savedMeals', mealsStore.meals.length)) {
    upgradeModal.openForGate({
      limitKey: 'savedMeals',
      used: mealsStore.meals.length,
    });
    return;
  }
  const name = prompt('New meal name:');
  if (!name || !name.trim()) return;
  const foodItemId = entry.foodItemId?._id;
  if (!foodItemId) return;
  const meal = await mealsStore.createMeal(name.trim());
  await mealsStore.addItem(meal._id, foodItemId, entry.servingCount);
}

// ---- Copy / Move flows --------------------------------------------------

function openPicker({ mode, ids, title }) {
  pickerMode.value = mode;
  pickerTargetIds.value = ids;
  pickerTitle.value = title;
  pickerOpen.value = true;
}
function closePicker() {
  pickerOpen.value = false;
  pickerTargetIds.value = [];
}
async function handlePickerConfirm(dates) {
  const ids = pickerTargetIds.value;
  if (!ids.length || !dates.length) {
    closePicker();
    return;
  }
  if (pickerMode.value === 'copy') {
    await foodlogStore.copyEntries(ids, dates);
  } else {
    await foodlogStore.moveEntries(ids, dates);
  }
  closePicker();
}
function startCopyEntry(entry) {
  openPicker({ mode: 'copy', ids: [entry._id], title: `Copy "${entry.foodItemId?.name || 'entry'}" to...` });
}
function startMoveEntry(entry) {
  openPicker({ mode: 'move', ids: [entry._id], title: `Move "${entry.foodItemId?.name || 'entry'}" to...` });
}
function startCopyGroup(group) {
  openPicker({ mode: 'copy', ids: group.entries.map((e) => e._id), title: `Copy "${group.mealName}" to...` });
}
function startMoveGroup(group) {
  openPicker({ mode: 'move', ids: group.entries.map((e) => e._id), title: `Move "${group.mealName}" to...` });
}

// All food-log entry IDs across every meal slot for the current day. Used
// by the "Copy day" button to fan a whole day's log out to one or more
// target dates via the same picker infrastructure.
const dayEntryIds = computed(() =>
  mealTypes.flatMap((m) => foodlogStore.entries[m.key] || []).map((e) => e._id),
);
function formatDayLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function startCopyDay() {
  const ids = dayEntryIds.value;
  if (!ids.length) return;
  openPicker({ mode: 'copy', ids, title: `Copy ${formatDayLabel(date.value)} to...` });
}

// ---- Symptoms -----------------------------------------------------------

const dotColors = [
  '#fde047', '#fcd34d', '#fbbf24', '#f59e0b', '#fb923c',
  '#f97316', '#ea580c', '#f87171', '#ef4444', '#dc2626',
];
const zeroColor = '#22c55e';

const addingSymptom = ref(false);
const newSymptomName = ref('');
const symptomError = ref('');

function isDotActive(severity, n) {
  if (severity == null) return false;
  if (n === 0) return severity === 0;
  return severity >= n;
}

// Only the dot representing the row's current value should participate in
// text selection. If no severity is set the current value is treated as 0,
// so a click-drag across a row of symptoms copies "0 0 0 0 ..." instead of
// "0 1 2 3 4 5 6 7 8 9 10".
function isDotCopyable(severity, n) {
  const current = severity == null ? 0 : severity;
  return n === current;
}

async function setSeverity(symptomId, value) {
  const current = symptomsStore.getSeverity(symptomId);
  if (current === value) {
    await symptomsStore.setSeverity(symptomId, null);
  } else {
    await symptomsStore.setSeverity(symptomId, value);
  }
}

async function handleAddSymptom() {
  if (!newSymptomName.value.trim()) return;
  symptomError.value = '';
  try {
    await symptomsStore.createSymptom(newSymptomName.value.trim());
    newSymptomName.value = '';
    addingSymptom.value = false;
  } catch (err) {
    symptomError.value = err.message;
  }
}

async function handleDeleteSymptom(symptom) {
  if (!confirm(`Remove "${symptom.name}"? Past entries for this symptom will also be deleted.`)) return;
  await symptomsStore.deleteSymptom(symptom._id);
}

// ---- Water tracker ------------------------------------------------------

const waterSettings = computed(() => settingsStore.settings?.water || {});
const waterEnabled = computed(() => Boolean(waterSettings.value.enabled));
const waterUnit = computed(() => waterSettings.value.unit || 'fl_oz');
const waterServingMl = computed(() => Number(waterSettings.value.servingMl) || 250);
const waterTargetMl = computed(() => Number(waterSettings.value.dailyTargetMl) || 2000);
const waterDropCount = computed(() =>
  Math.max(1, Math.ceil(waterTargetMl.value / waterServingMl.value)),
);
const waterEntriesToday = computed(() => waterStore.entriesFor(date.value));
const waterFilledCount = computed(() => waterEntriesToday.value.length);
const waterTotalMl = computed(() =>
  waterEntriesToday.value.reduce((sum, e) => sum + (e.volumeMl || 0), 0),
);
const waterTotalDisplay = computed(() => {
  const v = mlToUnit(waterTotalMl.value, waterUnit.value);
  return waterUnit.value === 'fl_oz' ? Math.round(v) : Math.round(v);
});
const waterTargetDisplay = computed(() => {
  const v = mlToUnit(waterTargetMl.value, waterUnit.value);
  return waterUnit.value === 'fl_oz' ? Math.round(v) : Math.round(v);
});
const waterUnitLabel = computed(() => (waterUnit.value === 'fl_oz' ? 'fl oz' : 'ml'));
const waterGoalHit = computed(() => waterTotalMl.value >= waterTargetMl.value);
const waterBusy = ref(false);

// Tap drop at 1-based index `n`. If it's already the last filled drop,
// decrement (delete latest entry); otherwise add entries until count = n.
async function handleDropTap(n) {
  if (waterBusy.value) return;
  waterBusy.value = true;
  try {
    const current = waterFilledCount.value;
    if (n === current) {
      await waterStore.popLatest(date.value);
    } else if (n > current) {
      const toAdd = n - current;
      for (let i = 0; i < toAdd; i++) {
        await waterStore.addEntry(waterServingMl.value, date.value);
      }
    } else {
      const toRemove = current - n;
      for (let i = 0; i < toRemove; i++) {
        await waterStore.popLatest(date.value);
      }
    }
  } finally {
    waterBusy.value = false;
  }
}

// ---- Weight + dose forms ------------------------------------------------

const todaysWeight = computed(() =>
  weightStore.entries.find((e) => String(e.date).slice(0, 10) === date.value),
);

// Compounds + per-compound dose state for the rendered cards.
const enabledCompounds = computed(() => compoundsStore.enabled);

function todaysDoseFor(compoundId) {
  return dosesStore.todaysDoseFor(compoundId, date.value);
}

// "Next dose" label for a single compound, anchored on its own intervalDays
// and its own latest dose (regardless of selected page date).
function nextDoseLabelFor(compound) {
  const latest = dosesStore.latestDoseFor(compound._id);
  if (!latest) return null;

  const lastDateStr = String(latest.date).slice(0, 10);
  const [y, m, d] = lastDateStr.split('-').map(Number);
  const last = new Date(y, m - 1, d);
  const next = new Date(last);
  next.setDate(next.getDate() + compound.intervalDays);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((next.getTime() - today.getTime()) / 86400000);
  const dayName = next.toLocaleDateString(undefined, { weekday: 'long' });

  if (diffDays < 0) return { text: `Overdue by ${-diffDays} day${-diffDays === 1 ? '' : 's'}`, urgent: true };
  if (diffDays === 0) return { text: `Today — log now`, urgent: true };
  if (diffDays === 1) return { text: `Tomorrow (${dayName})`, urgent: true };
  return { text: `In ${diffDays} days (${dayName})`, urgent: false };
}

async function handleAddWeight() {
  if (!newWeight.value) return;
  savingWeight.value = true;
  try {
    await weightStore.addWeight(Number(newWeight.value), date.value);
    newWeight.value = '';
  } finally {
    savingWeight.value = false;
  }
}

async function handleAddDose(compound) {
  const raw = newDoseByCompound[compound._id];
  if (raw === '' || raw == null) return;
  savingDoseByCompound[compound._id] = true;
  try {
    await dosesStore.addDose({
      compoundId: compound._id,
      value: Number(raw),
      date: date.value,
    });
    newDoseByCompound[compound._id] = '';
  } finally {
    savingDoseByCompound[compound._id] = false;
  }
}

async function handleDeleteWeight() {
  if (!todaysWeight.value) return;
  await weightStore.deleteWeight(todaysWeight.value._id);
}

const photosVisibleOnLog = computed(() => {
  const p = settingsStore.settings?.photos;
  if (!p || !p.enabled) return false;
  return p.showOnLog !== false;
});

async function handleDeleteDose(dose) {
  if (!dose) return;
  await dosesStore.deleteDose(dose._id);
}

// ---- Day note -----------------------------------------------------------

const noteDraft = ref('');
let noteSaveTimer = null;

function onNoteInput() {
  if (noteSaveTimer) clearTimeout(noteSaveTimer);
  const dateAtTypingStart = date.value;
  const valueAtTypingStart = noteDraft.value;
  noteSaveTimer = setTimeout(() => {
    notesStore.save(dateAtTypingStart, valueAtTypingStart);
  }, 600);
}

function onNoteBlur() {
  if (noteSaveTimer) {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = null;
  }
  notesStore.save(date.value, noteDraft.value);
}
</script>

<template>
  <div class="log-page" data-testid="log-page">
    <FastingBanner surface="log" />
    <DateSelector v-model="date" />

    <!-- =========================================================== -->
    <!-- WATER (drop row, conditional)                                -->
    <!-- =========================================================== -->
    <div v-if="waterEnabled" id="water" class="meal-card compact water-card">
      <div class="water-head">
        <h3 class="water-title">Water</h3>
        <span class="water-total" :class="{ hit: waterGoalHit }">
          {{ waterTotalDisplay }} / {{ waterTargetDisplay }} {{ waterUnitLabel }}
        </span>
      </div>
      <div class="water-drops">
        <button
          v-for="n in waterDropCount"
          :key="n"
          type="button"
          class="water-drop"
          :class="{ filled: n <= waterFilledCount }"
          :aria-label="`Log drop ${n}`"
          :disabled="waterBusy"
          @click="handleDropTap(n)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2.5 C12 2.5 5 11 5 16 C5 19.866 8.134 23 12 23 C15.866 23 19 19.866 19 16 C19 11 12 2.5 12 2.5 Z"
            />
          </svg>
        </button>
      </div>
    </div>

    <!-- =========================================================== -->
    <!-- TOP ROW: Nutrition (half) + stacked Weight/Dose (half)       -->
    <!-- =========================================================== -->
    <div
      v-if="foodlogStore.summary"
      id="nutrition"
      class="meal-card nutrition-card"
    >
      <div class="meal-header"><h3>Nutrition</h3></div>
      <DailySummary :summary="foodlogStore.summary" />
    </div>

    <!-- =========================================================== -->
    <!-- ROLLING 7-DAY BUDGET                                         -->
    <!-- =========================================================== -->
    <div id="weekly" class="weekly-wrap">
      <WeeklyBudgetStrip v-if="planLimits.hasFeature('rolling7DayTargets')" />
      <button
        v-else-if="rolling7DayUpgradeTier"
        type="button"
        class="weekly-upsell"
        @click="upgradeModal.openForGate({ featureKey: 'rolling7DayTargets' })"
      >
        <span class="weekly-upsell-label">
          Rolling 7-day macro targets
          <UpgradeBadge :tier="rolling7DayUpgradeTier" />
        </span>
        <span class="weekly-upsell-sub">
          Smooth out weekly variance — over today, under tomorrow, still on
          plan.
        </span>
      </button>
    </div>

    <!-- =========================================================== -->
    <!-- BODY METRICS + COMPOUNDS                                      -->
    <!-- =========================================================== -->
    <div id="body" class="meal-card compact">
      <div class="body-metrics">
        <div class="metric-col" v-tooltip="'Log your weight'">
          <div class="metric-label">Weight</div>
          <form
            v-if="!todaysWeight"
            class="quick-form"
            @submit.prevent="handleAddWeight"
          >
            <input
              type="number"
              v-model.number="newWeight"
              step="0.1"
              placeholder="lbs"
              required
              @focus="weightInputFocused = true"
              @blur="weightInputFocused = false"
            />
            <button
              class="btn-primary"
              :class="{ muted: !weightInputFocused && !newWeight }"
              type="submit"
              :disabled="savingWeight"
            >
              Log
            </button>
          </form>
          <div v-else class="logged-row">
            <span class="logged-value">{{ todaysWeight.weightLbs }} lbs</span>
            <button class="delete-btn" @click="handleDeleteWeight">x</button>
          </div>
        </div>
      </div>
    </div>

    <!-- =========================================================== -->
    <!-- METRICS (user-configured biometrics)                          -->
    <!-- =========================================================== -->
    <div
      v-if="enabledMetrics.length"
      id="metrics"
      class="meal-card compact"
    >
      <div class="body-metrics">
        <div
          v-for="metric in enabledMetrics"
          :key="metric._id"
          class="metric-col"
          v-tooltip="`Log ${metric.name}`"
        >
          <div class="metric-label">{{ metric.name }}</div>
          <form
            v-if="metricDisplayValue(metric) === null"
            class="quick-form"
            @submit.prevent="handleAddMetric(metric)"
          >
            <input
              type="number"
              v-model.number="newMetricByMetric[metric._id]"
              step="0.1"
              :placeholder="unitLabel(metricDisplayUnit(metric)) || metric.dimension"
              required
              @focus="metricInputFocused[metric._id] = true"
              @blur="metricInputFocused[metric._id] = false"
            />
            <button
              class="btn-primary"
              :class="{
                muted:
                  !metricInputFocused[metric._id] &&
                  !newMetricByMetric[metric._id],
              }"
              type="submit"
              :disabled="savingMetricByMetric[metric._id]"
            >
              Log
            </button>
          </form>
          <div v-else class="logged-row">
            <span class="logged-value">
              {{ metricDisplayValue(metric) }}
              {{ unitLabel(metricDisplayUnit(metric)) }}
            </span>
            <button class="delete-btn" @click="handleDeleteMetric(metric)">x</button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="enabledCompounds.length"
      id="compounds"
      class="meal-card compact compounds-card"
    >
      <div
        v-for="compound in enabledCompounds"
        :key="compound._id"
        class="compound-row"
        v-tooltip="`Log ${compound.name} dose`"
      >
        <div class="metric-label">{{ compound.name }}</div>
        <form
          v-if="!todaysDoseFor(compound._id)"
          class="quick-form"
          @submit.prevent="handleAddDose(compound)"
        >
          <input
            type="number"
            v-model.number="newDoseByCompound[compound._id]"
            step="0.25"
            :placeholder="compound.doseUnit"
            required
            @focus="doseInputFocused[compound._id] = true"
            @blur="doseInputFocused[compound._id] = false"
          />
          <button
            class="btn-primary"
            :class="{
              muted:
                !doseInputFocused[compound._id] &&
                !newDoseByCompound[compound._id],
            }"
            type="submit"
            :disabled="savingDoseByCompound[compound._id]"
          >
            {{ savingDoseByCompound[compound._id] ? 'Saving...' : 'Log' }}
          </button>
        </form>
        <div v-else class="logged-row">
          <span class="logged-value">
            {{ todaysDoseFor(compound._id).value }} {{ compound.doseUnit }}
          </span>
          <button
            class="delete-btn"
            @click="handleDeleteDose(todaysDoseFor(compound._id))"
          >
            x
          </button>
        </div>
        <div
          v-if="nextDoseLabelFor(compound)"
          class="next-dose"
          :class="{ urgent: nextDoseLabelFor(compound).urgent }"
        >
          <span class="next-dose-label">Next dose:</span>
          {{ nextDoseLabelFor(compound).text }}
        </div>
      </div>
    </div>

    <!-- =========================================================== -->
    <!-- FOOD LOG                                                     -->
    <!-- =========================================================== -->
    <div id="food" class="meal-card food-card">
      <div class="meal-header">
        <h3>Food</h3>
      </div>
      <div
        v-for="meal in orderedMealTypes"
        :key="meal.key"
        class="meal-section"
      >
        <div class="meal-section-header">
          <h4>{{ meal.label }}</h4>
          <button
            class="add-btn"
            v-tooltip="`Add to ${meal.label.toLowerCase()}`"
            @click="addFood(meal.key)"
          >
            +
          </button>
        </div>
        <div
          v-if="foodlogStore.entries[meal.key].length"
          class="meal-table-wrap"
        >
          <table class="meal-table">
            <thead>
              <tr>
                <th class="col-check"></th>
                <th class="col-name">Item</th>
                <th class="col-srv">Servings</th>
                <th class="col-num sortable" @click="toggleSort('cal')">
                  Kcal{{ sortIndicator('cal') }}
                </th>
                <th class="col-num col-p sortable" @click="toggleSort('p')">
                  Pro{{ sortIndicator('p') }}
                </th>
                <th class="col-num col-f sortable" @click="toggleSort('f')">
                  Fat{{ sortIndicator('f') }}
                </th>
                <th class="col-num col-c sortable" @click="toggleSort('c')">
                  Carb{{ sortIndicator('c') }}
                </th>
                <th class="col-del"></th>
              </tr>
            </thead>
            <tbody>
              <template
                v-for="(row, rowIdx) in groupedBySlot[meal.key]"
                :key="row.type === 'group' ? `g-${row.mealId}-${rowIdx}` : `e-${row.entry._id}`"
              >
                <tr
                  v-if="row.type === 'entry'"
                  class="entry-row"
                  :class="{ unconsumed: row.entry.consumed === false }"
                >
                  <td class="col-check">
                    <input
                      type="checkbox"
                      :checked="row.entry.consumed !== false"
                      v-tooltip="row.entry.consumed !== false ? 'Mark as not yet eaten' : 'Mark as eaten'"
                      @click.stop
                      @change="foodlogStore.toggleConsumed(row.entry._id, $event.target.checked)"
                    />
                  </td>
                  <td class="col-name">
                    <span
                      v-if="row.entry.foodItemId?.emoji"
                      class="entry-emoji"
                      >{{ row.entry.foodItemId.emoji }}</span
                    >
                    <span
                      class="entry-name"
                      :class="{ planned: row.entry.consumed === false }"
                      >{{ row.entry.foodItemId?.name




                      }}<span
                        v-if="row.entry.consumed === false"
                        class="planned-tag"
                      >
                        (planned)</span
                      ></span
                    >
                  </td>
                  <td class="col-srv">
                    <template v-if="editingId === row.entry._id">
                      <input
                        type="number"
                        v-model.number="editServings"
                        min="0"
                        step="0.25"
                        class="edit-input"
                        @click.stop
                        @keyup.enter="saveEdit(row.entry._id)"
                        @keyup.escape="cancelEdit"
                      />
                      <button
                        class="save-btn"
                        @click.stop="saveEdit(row.entry._id)"
                      >
                        ✓
                      </button>
                    </template>
                    <span
                      v-else
                      class="servings"
                      @click.stop="startEdit(row.entry)"
                    >
                      {{ row.entry.servingCount }}
                    </span>
                  </td>
                  <td class="col-num">{{ entryNutrition(row.entry).cal }}</td>
                  <td class="col-num col-p">
                    {{ entryNutrition(row.entry).p }}
                  </td>
                  <td class="col-num col-f">
                    {{ entryNutrition(row.entry).f }}
                  </td>
                  <td class="col-num col-c">
                    {{ entryNutrition(row.entry).c }}
                  </td>
                  <td class="col-del">
                    <VDropdown
                      placement="bottom-end"
                      :distance="4"
                      @hide="openSubmenu = null"
                    >
                      <button class="menu-btn">⋯</button>
                      <template #popper>
                        <div class="menu">
                          <button
                            class="menu-item"
                            v-close-popper
                            @click="openEditModal(row.entry)"
                          >
                            Update item
                          </button>
                          <button
                            class="menu-item"
                            v-close-popper
                            @click="handleDelete(row.entry)"
                          >
                            Remove from {{ meal.label }}
                          </button>
                          <button
                            class="menu-item"
                            v-close-popper
                            @click="startCopyEntry(row.entry)"
                          >
                            Copy to...
                          </button>
                          <button
                            class="menu-item"
                            v-close-popper
                            @click="startMoveEntry(row.entry)"
                          >
                            Move to...
                          </button>
                          <button
                            class="menu-item with-submenu"
                            @click="openSubmenu = openSubmenu === 'addToMeal' ? null : 'addToMeal'"
                          >
                            Add to meal ▸
                          </button>
                          <div
                            v-if="openSubmenu === 'addToMeal'"
                            class="submenu"
                          >
                            <button
                              class="menu-item"
                              v-close-popper
                              @click="addEntryToNewMeal(row.entry)"
                            >
                              + New meal...
                            </button>
                            <button
                              v-for="m in mealsStore.meals"
                              :key="m._id"
                              class="menu-item"
                              v-close-popper
                              @click="addEntryToMeal(row.entry, m._id)"
                            >
                              {{ m.name }}
                            </button>
                            <p
                              v-if="!mealsStore.meals.length"
                              class="menu-empty"
                            >
                              No meals yet
                            </p>
                          </div>
                        </div>
                      </template>
                    </VDropdown>
                  </td>
                </tr>

                <template v-else>
                  <tr
                    class="meal-group-header"
                    @click="toggleCollapsed(meal.key, row.mealId)"
                  >
                    <td class="col-check"></td>
                    <td class="col-name">
                      <span
                        class="caret"
                        >{{ isCollapsed(meal.key, row.mealId) ? '▸' : '▾' }}</span
                      >
                      <span
                        v-if="row.mealEmoji"
                        class="entry-emoji"
                        >{{ row.mealEmoji }}</span
                      >
                      <span class="group-name">{{ row.mealName }}</span>
                      <span class="group-count"
                        >{{ row.entries.length }}
                        item{{ row.entries.length === 1 ? '' : 's' }}</span
                      >
                    </td>
                    <td class="col-srv"></td>
                    <td class="col-num">{{ sumNutrition(row.entries).cal }}</td>
                    <td class="col-num col-p">
                      {{ sumNutrition(row.entries).p }}
                    </td>
                    <td class="col-num col-f">
                      {{ sumNutrition(row.entries).f }}
                    </td>
                    <td class="col-num col-c">
                      {{ sumNutrition(row.entries).c }}
                    </td>
                    <td class="col-del">
                      <VDropdown placement="bottom-end" :distance="4">
                        <button class="menu-btn" @click.stop>⋯</button>
                        <template #popper>
                          <div class="menu">
                            <button
                              class="menu-item"
                              v-close-popper
                              @click="handleDeleteGroup(meal.key, row)"
                            >
                              Remove from {{ meal.label }}
                            </button>
                            <button
                              class="menu-item"
                              v-close-popper
                              @click="startCopyGroup(row)"
                            >
                              Copy to...
                            </button>
                            <button
                              class="menu-item"
                              v-close-popper
                              @click="startMoveGroup(row)"
                            >
                              Move to...
                            </button>
                          </div>
                        </template>
                      </VDropdown>
                    </td>
                  </tr>
                  <template v-if="!isCollapsed(meal.key, row.mealId)">
                    <tr
                      v-for="child in sortEntries(row.entries)"
                      :key="`gc-${child._id}`"
                      class="entry-row group-child"
                      :class="{ unconsumed: child.consumed === false }"
                    >
                      <td class="col-check">
                        <input
                          type="checkbox"
                          :checked="child.consumed !== false"
                          v-tooltip="child.consumed !== false ? 'Mark as not yet eaten' : 'Mark as eaten'"
                          @click.stop
                          @change="foodlogStore.toggleConsumed(child._id, $event.target.checked)"
                        />
                      </td>
                      <td class="col-name">
                        <span
                          class="entry-name indent"
                          :class="{ planned: child.consumed === false }"
                        >
                          <span
                            v-if="child.foodItemId?.emoji"
                            class="entry-emoji"
                            >{{ child.foodItemId.emoji }}</span
                          >
                          {{ child.foodItemId?.name




                          }}<span
                            v-if="child.consumed === false"
                            class="planned-tag"
                          >
                            (planned)</span
                          >
                        </span>
                      </td>
                      <td class="col-srv">
                        <template v-if="editingId === child._id">
                          <input
                            type="number"
                            v-model.number="editServings"
                            min="0"
                            step="0.25"
                            class="edit-input"
                            @click.stop
                            @keyup.enter="saveEdit(child._id)"
                            @keyup.escape="cancelEdit"
                          />
                          <button
                            class="save-btn"
                            @click.stop="saveEdit(child._id)"
                          >
                            ✓
                          </button>
                        </template>
                        <span
                          v-else
                          class="servings"
                          @click.stop="startEdit(child)"
                        >
                          {{ child.servingCount }}
                        </span>
                      </td>
                      <td class="col-num">{{ entryNutrition(child).cal }}</td>
                      <td class="col-num col-p">
                        {{ entryNutrition(child).p }}
                      </td>
                      <td class="col-num col-f">
                        {{ entryNutrition(child).f }}
                      </td>
                      <td class="col-num col-c">
                        {{ entryNutrition(child).c }}
                      </td>
                      <td class="col-del">
                        <button
                          class="delete-btn"
                          @click.stop="foodlogStore.deleteEntry(child._id)"
                        >
                          x
                        </button>
                      </td>
                    </tr>
                  </template>
                </template>
              </template>
            </tbody>
            <tfoot>
              <tr>
                <td class="col-check"></td>
                <td class="col-name">Total</td>
                <td class="col-srv"></td>
                <td class="col-num">
                  {{ sumNutrition(foodlogStore.entries[meal.key]).cal }}
                </td>
                <td class="col-num col-p">
                  {{ sumNutrition(foodlogStore.entries[meal.key]).p }}
                </td>
                <td class="col-num col-f">
                  {{ sumNutrition(foodlogStore.entries[meal.key]).f }}
                </td>
                <td class="col-num col-c">
                  {{ sumNutrition(foodlogStore.entries[meal.key]).c }}
                </td>
                <td class="col-del"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p v-else class="empty">No items.</p>
      </div>

      <div class="food-card-footer">
        <button
          type="button"
          class="btn-text sm"
          v-tooltip="'Copy every food entry on this day to one or more other dates'"
          :disabled="!dayEntryIds.length"
          @click="startCopyDay"
        >
          Copy day →
        </button>
      </div>
    </div>

    <!-- =========================================================== -->
    <!-- SYMPTOMS                                                     -->
    <!-- =========================================================== -->
    <div id="symptoms" class="meal-card">
      <div class="meal-header">
        <h3>
          Symptoms
          <UpgradeBadge
            v-if="!hasAdvancedSymptoms && symptomsUpgradeTier"
            :tier="symptomsUpgradeTier"
            feature-key="advancedSymptomAnalytics"
            clickable
          />
        </h3>
      </div>
      <p class="hint">
        <template v-if="hasAdvancedSymptoms">
          Tap a dot to log severity (0 = none, 1-10 = mild → severe). Tap again
          to clear.
        </template>
        <template v-else>
          Tap to log present (1) or absent (0). Tap again to clear.
        </template>
      </p>

      <div class="symptoms-list">
        <div
          v-for="symptom in symptomsStore.symptoms"
          :key="symptom._id"
          class="symptom-row"
        >
          <div class="symptom-header">
            <span class="symptom-name">{{ symptom.name }}</span>
            <button
              v-if="!symptom.isDefault"
              v-tooltip="`Delete '${symptom.name}' symptom`"
              class="delete-btn"
              :aria-label="`Delete ${symptom.name} symptom`"
              @click="handleDeleteSymptom(symptom)"
            >
              x
            </button>
          </div>
          <div class="dots">
            <button
              type="button"
              class="dot dot-zero"
              :class="{
                active: isDotActive(symptomsStore.getSeverity(symptom._id), 0),
                copyable: isDotCopyable(symptomsStore.getSeverity(symptom._id), 0),
              }"
              :style="isDotActive(symptomsStore.getSeverity(symptom._id), 0) ? { background: zeroColor, borderColor: zeroColor } : {}"
              title="None"
              @click="setSeverity(symptom._id, 0)"
            >
              0
            </button>
            <button
              v-for="i in (hasAdvancedSymptoms ? 10 : 1)"
              :key="i"
              type="button"
              class="dot"
              :class="{
                active: isDotActive(symptomsStore.getSeverity(symptom._id), i),
                copyable: isDotCopyable(symptomsStore.getSeverity(symptom._id), i),
              }"
              :style="isDotActive(symptomsStore.getSeverity(symptom._id), i) ? { background: dotColors[i - 1], borderColor: dotColors[i - 1] } : {}"
              :title="hasAdvancedSymptoms ? `${i}/10` : 'Present'"
              @click="setSeverity(symptom._id, i)"
            >
              {{ i }}
            </button>
          </div>
        </div>
      </div>

      <div class="add-symptom">
        <button
          v-if="!addingSymptom"
          class="btn-secondary"
          @click="addingSymptom = true"
        >
          + Add custom symptom
        </button>
        <form v-else class="quick-form" @submit.prevent="handleAddSymptom">
          <input
            v-model="newSymptomName"
            type="text"
            placeholder="Symptom name"
            autofocus
            @keyup.escape="addingSymptom = false; newSymptomName = ''"
          />
          <button class="btn-primary" type="submit">Add</button>
          <button
            class="btn-text"
            type="button"
            @click="addingSymptom = false; newSymptomName = ''"
          >
            Cancel
          </button>
        </form>
        <p v-if="symptomError" class="error">{{ symptomError }}</p>
      </div>
    </div>

    <!-- =========================================================== -->
    <!-- DAY NOTE                                                     -->
    <!-- =========================================================== -->
    <div id="notes" class="meal-card">
      <div class="meal-header">
        <h3>Journal Notes</h3>
        <span v-if="notesStore.saving" class="card-sub">saving...</span>
      </div>
      <p class="hint">
        Capture how you felt or anything worth remembering about today.
      </p>
      <textarea
        v-model="noteDraft"
        class="note-textarea"
        rows="4"
        placeholder="Add context for the day..."
        @input="onNoteInput"
        @blur="onNoteBlur"
      ></textarea>
    </div>

    <!-- =========================================================== -->
    <!-- PHOTO LOG                                                    -->
    <!-- =========================================================== -->
    <div v-if="photosVisibleOnLog" id="photos">
      <PhotoCaptureCard :date="date" />
    </div>

    <DatePickerModal
      :open="pickerOpen"
      :title="pickerTitle"
      :confirm-label="pickerMode === 'copy' ? 'Copy' : 'Move'"
      :initial-month="date?.slice(0, 7)"
      @confirm="handlePickerConfirm"
      @close="closePicker"
    />

    <FoodItemEditModal
      :open="editModalOpen"
      :food-item="editFoodItem"
      @saved="handleEditSaved"
      @close="editModalOpen = false"
    />
  </div>
</template>

<style scoped>
.log-page { max-width: 720px; }

/* Mobile: pin the prev/next/day-name selector to the top of the viewport so
   it stays reachable while the user scrolls through nutrition, food log,
   symptoms, etc. Window is the scroll container on mobile (see AppLayout.vue
   mobile override), so `position: sticky; top: 0` anchors to viewport top.
   Solid bg keeps scrolled content from bleeding through. */
@media (max-width: 768px) {
  .log-page :deep(.date-selector) {
    position: sticky;
    top: 0;
    z-index: 20;
    background: color-mix(in srgb, var(--bg) 80%, transparent);
    backdrop-filter: blur(12px) saturate(140%);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border);
  }
}

/* The nutrition card uses the same shell as a meal card but its inner padding
   gets a touch more breathing room since the macro bars need vertical space. */
/* Water tracker — single row of tappable drop icons. Each click of an unfilled
   drop logs one serving (servingMl); tapping the last filled drop deletes it. */
.water-card { padding: var(--space-3) var(--space-5); }
.water-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
.water-title {
  margin: 0;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.water-total {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.water-total.hit { color: var(--success, #16a34a); font-weight: var(--font-weight-bold); }
.water-drops {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}
.water-drop {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  line-height: 0;
  border-radius: var(--radius-small);
}
.water-drop:disabled { cursor: wait; opacity: 0.6; }
.water-drop svg {
  width: 28px;
  height: 28px;
  fill: transparent;
  stroke: color-mix(in srgb, var(--text-tertiary) 60%, transparent);
  stroke-width: 1.5;
  transition: fill 120ms ease, stroke 120ms ease, transform 120ms ease;
}
.water-drop:hover svg { stroke: var(--text-secondary); }
.water-drop:active svg { transform: scale(0.92); }
.water-drop.filled svg {
  fill: var(--water, #06b6d4);
  stroke: var(--water, #06b6d4);
}

.nutrition-card { padding-bottom: var(--space-5); }
.nutrition-card :deep(.daily-summary) {
  background: transparent;
  border: none;
  padding: 0;
}

/* Top row: Nutrition (half) + stacked Weight/Dose (half). Collapses to a
   single column when the viewport gets too narrow. */
.top-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.top-row .top-col { min-width: 0; }
.top-row .meal-card { margin-bottom: 0; }
.stacked-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.meal-card.compact { padding: var(--space-4) var(--space-5); }
.meal-card.compact .meal-header { margin-bottom: var(--space-1); }
.body-metrics {
  display: flex;
  gap: var(--space-4);
}
.metric-col { flex: 1; min-width: 0; }
.metric-label,
.meal-card.compact .meal-header h3 {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-secondary);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  margin: 0 0 var(--space-2);
}

.card-sub {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
}
.compounds-card .compound-row + .compound-row {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}
.next-dose {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.next-dose.urgent { color: var(--warning); font-weight: var(--font-weight-bold); }
.next-dose-label { font-weight: var(--font-weight-medium); color: var(--text-secondary); }
@media (max-width: 540px) {
  .top-row { grid-template-columns: 1fr; }
}

.weekly-wrap { margin-bottom: var(--space-3); }
.food-card-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}
.weekly-upsell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  background: var(--surface);
  border: 1px dashed var(--border);
  padding: 14px 18px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  color: var(--text-secondary);
  transition: border-color 0.15s ease;
}
.weekly-upsell:hover { border-color: var(--primary); }
.weekly-upsell-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.02em;
}
.weekly-upsell-sub { font-size: 12px; }

.meal-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-3);
}
.meal-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.meal-header h3 {
  margin: 0;
  flex: 1;
  font-size: var(--font-size-m);
}

/* Food card with stacked meal sections (Breakfast / Lunch / Dinner / Snack). */
.food-card .meal-section + .meal-section {
  border-top: 1px solid var(--border);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
}
.meal-section-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}
.meal-section-header h4 {
  margin: 0;
  flex: 1;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
}

.add-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-small);
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  font-size: var(--font-size-l);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-base);
}
.add-btn:hover { background: var(--primary-hover); }

.meal-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-s);
  font-variant-numeric: tabular-nums;
}
.meal-table th {
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border);
}
.meal-table th.col-name,
.meal-table th.col-srv { color: var(--text-tertiary); }
.meal-table td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.meal-table tbody tr:last-child td { border-bottom: none; }
.meal-table tfoot td {
  border-top: 1px solid var(--border);
  border-bottom: none;
  padding-top: var(--space-2);
  font-weight: var(--font-weight-bold);
}
.meal-table tfoot td.col-name {
  color: var(--text-tertiary);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}

.col-name {
  text-align: left;
  min-width: 140px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* On narrow screens the meal-table is wider than the card. Wrap it so the
   table can scroll horizontally instead of squeezing the item name to nothing.
   `-webkit-overflow-scrolling: touch` keeps momentum scroll on iOS. */
.meal-table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.col-srv { text-align: center; width: 3.5rem; }
.col-num { text-align: right; width: 3rem; padding-left: 0.25rem; padding-right: 0.25rem; }
.col-check { width: 1.5rem; text-align: center; padding-right: 0; }
.col-check input[type="checkbox"] {
  accent-color: var(--primary);
  width: 15px;
  height: 15px;
  cursor: pointer;
  margin: 0;
}
.entry-row.unconsumed td { opacity: 0.4; }
.entry-row.unconsumed td.col-check { opacity: 1; }
.col-del { width: 1.75rem; text-align: right; padding-right: 0; }

.meal-table th.col-num { color: var(--text-secondary); }
.meal-table th.sortable { cursor: pointer; user-select: none; }
.meal-table th.sortable:hover { color: var(--text); }
.meal-table tbody td.col-num:not(.col-p):not(.col-f):not(.col-c) { color: var(--color-cal); font-weight: var(--font-weight-bold); }
.meal-table td.col-p { color: var(--color-protein); }
.meal-table td.col-f { color: var(--color-fat); }
.meal-table td.col-c { color: var(--color-carbs); }
.meal-table th.col-p { color: var(--color-protein); }
.meal-table th.col-f { color: var(--color-fat); }
.meal-table th.col-c { color: var(--color-carbs); }
.meal-table tfoot td.col-num:not(.col-p):not(.col-f):not(.col-c) { color: var(--color-cal); }

.entry-name { font-weight: var(--font-weight-medium); color: var(--text); }
.entry-name.planned { font-style: italic; }
.planned-tag { color: var(--text-tertiary); font-weight: var(--font-weight-light); font-style: italic; }
.entry-emoji { display: inline-block; margin-right: var(--space-1); font-size: var(--font-size-m); line-height: 1; }
.servings {
  cursor: pointer;
  border-bottom: 1px dotted var(--text-secondary);
  padding: 0 0.15rem;
}
.edit-input {
  width: 48px;
  padding: 0.15rem var(--space-1);
  font-size: var(--font-size-s);
}
.save-btn {
  font-size: var(--font-size-xs);
  padding: 0.1rem var(--space-1);
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  cursor: pointer;
  margin-left: 0.2rem;
}
.delete-btn, .menu-btn {
  background: none;
  border: none;
  color: var(--text-disabled);
  cursor: pointer;
  font-size: var(--font-size-s);
  padding: var(--space-1);
}
.menu-btn { font-size: var(--font-size-l); line-height: 1; color: var(--text); }
.delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  text-transform: uppercase;
  transition: color var(--transition-fast), background var(--transition-fast);
}
.delete-btn:hover { color: var(--danger); background: var(--danger-soft); }
.menu-btn:hover { color: var(--text); background: var(--bg); }

.menu-anchor { position: relative; display: inline-block; }
.menu {
  min-width: 180px;
  /* 90% opaque so a frosted backdrop-blur shows the page underneath. */
  background: color-mix(in srgb, var(--bg) 90%, transparent);
  backdrop-filter: blur(12px) saturate(140%);
  -webkit-backdrop-filter: blur(12px) saturate(140%);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-m);
  padding: 0;
  overflow: hidden;
}
.menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: var(--space-2) var(--space-3);
  background: none;
  border: none;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  color: var(--text);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  transition: background var(--transition-fast);
}
.menu-item:last-child { border-bottom: none; }
.menu-item:hover { background: var(--surface); }
.menu-item.with-submenu { position: relative; }
/* Submenu sits flush against the with-submenu trigger — the trigger's own
   border-bottom acts as the divider, so no extra rule needed here. */
.submenu {
  max-height: 240px;
  overflow-y: auto;
}
.menu-empty {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  padding: var(--space-2) var(--space-3);
  margin: 0;
}

.meal-group-header {
  background: var(--tint-carbs-softer);
  cursor: pointer;
}
.meal-group-header:hover { background: var(--tint-carbs-soft); }
.meal-group-header td { font-weight: var(--font-weight-bold); }
.meal-group-header .caret {
  display: inline-block;
  width: 0.9rem;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
}
.meal-group-header .group-name { color: var(--text); }
.meal-group-header .group-count {
  font-weight: var(--font-weight-light);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-left: var(--space-1);
}
.entry-name.indent { padding-left: var(--space-4); }
.group-child td { background: var(--tint-carbs-softest); }

.empty {
  color: var(--text-disabled);
  font-size: var(--font-size-s);
  padding: var(--space-1) 0;
  margin: 0;
}

/* Quick weight/dose form */
.quick-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.quick-form input {
  flex: 1;
  min-width: 0;
  max-width: 80px;
  height: var(--control-height-md);
  padding: 0 var(--control-pad-x-md);
  font-size: var(--font-size-s);
}
.metric-col .quick-form,
.compound-row .quick-form { gap: 0; }
.metric-col .quick-form input,
.compound-row .quick-form input {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.metric-col .quick-form .btn-primary,
.compound-row .quick-form .btn-primary {
  height: var(--control-height-md);
  padding: 0 var(--space-2);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}
/* Quick-log buttons stay muted until the user actually engages the input
   (focus or value present). Cuts the visual noise when the user is
   browsing the page rather than logging. */
.metric-col .quick-form .btn-primary.muted,
.compound-row .quick-form .btn-primary.muted {
  background: var(--bg);
  color: var(--text-tertiary);
  border: 1px solid var(--border);
}
.metric-col .quick-form .btn-primary.muted:hover,
.compound-row .quick-form .btn-primary.muted:hover {
  background: var(--surface);
  color: var(--text);
}

.logged-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.logged-value {
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

/* Symptoms */
.hint {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin: 0 0 var(--space-3);
}
.symptoms-list {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--space-3);
}
.symptom-row {
  padding: var(--space-3) 0;
}
.symptom-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  margin-bottom: var(--space-2);
}
.symptom-name {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-secondary);
  font-weight: var(--font-weight-bold);
  line-height: 1;
}
.dots {
  display: flex;
  gap: 0;
  flex-wrap: wrap;
}
.dot {
  flex: 1;
  min-width: 0;
  height: 28px;
  border-radius: 0;
  border: 1px solid var(--border);
  margin-left: -1px;
  background: var(--surface-raised);
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  font-family: var(--font-mono);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast), color var(--transition-fast);
  font-variant-numeric: tabular-nums;
  user-select: none;
  -webkit-user-select: none;
}
.dot:first-child { margin-left: 0; }
.dot.copyable {
  user-select: text;
  -webkit-user-select: text;
}
.dot:hover { background: var(--surface); color: var(--text); }
.dot.active { color: var(--bg); border-color: transparent; }
.dot.dot-zero { margin-right: var(--space-1); }

.add-symptom { margin-top: var(--space-1); }
.add-symptom > .btn-secondary {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}

.note-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-s);
  line-height: 1.4;
}
.error { color: var(--danger); font-size: var(--font-size-xs); margin: var(--space-1) 0 0; }
</style>
