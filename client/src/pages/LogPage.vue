<script setup>
import { ref, watch, onMounted, computed, reactive, nextTick } from 'vue';
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
import { useExercisesStore } from '../stores/exercises.js';
import { useExerciseLogStore } from '../stores/exerciselog.js';
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
import SignalChart from '../components/SignalChart.vue';
import { useChartSeries } from '../composables/useChartSeries.js';
import { localYmd } from '../utils/date.js';
import {
  computeKcal as sharedComputeKcal,
  defaultMetForClass,
  effectiveDailyCalTarget,
} from '../../../shared/logging/exerciseEnergy.js';

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
const exercisesStore = useExercisesStore();
const exerciseLogStore = useExerciseLogStore();
const settingsStore = useSettingsStore();
const photosStore = usePhotosStore();

const date = ref(route.query.date || localYmd());
const editingId = ref(null);
const editServings = ref(1);

// SignalChart for the log page: fixed 24h window centered on the
// selected `date`, empty default (user opts in to series via the
// "+ Add" popover). Reuses the dashboard's series catalog through
// useChartSeries so the same compound / nutrition / signal picks
// are available here.
const chartSeries = useChartSeries();

const chartFixedRange = computed(() => {
  // Anchor to the user's selected day in local time. The chart will
  // resolve x-axis labels relative to this window and clamp data to
  // it, so even multi-day series collapse to their in-range subset.
  const [y, m, d] = String(date.value).split('-').map(Number);
  if (!y || !m || !d) return null;
  const from = new Date(y, m - 1, d, 0, 0, 0, 0);
  const to = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { from, to };
});

// Chart data sources: dailyNutrition (food) + dailyBurn (exercise)
// stores expose multi-day arrays the chart resolver reads. Dashboard
// fetches them for its selected range; LogPage scopes the same fetch
// to the selected calendar day so the chart populates here too.
watch(
  () => date.value,
  (d) => {
    if (!d) return;
    foodlogStore.fetchDailyNutrition(d, d).catch(() => {});
    exerciseLogStore.fetchRangeBurn(d, d).catch(() => {});
  },
  { immediate: true },
);

// Endogenous-signal sim kick: when active series include endo signals
// AND the selected day changes, refetch a 24h window so the chart has
// data to render. Pages that don't surface endo signals can skip this.
const activeEndoSignals = computed(() => {
  // Pull the persisted active series from localStorage to know if any
  // endo signals are active. SignalChart manages this internally; we
  // peek at the same key for the side-effect of triggering sim runs.
  try {
    const raw = localStorage.getItem('log-chart:active');
    const ids = raw ? JSON.parse(raw) : [];
    return ids
      .filter((id) => typeof id === 'string' && id.startsWith('endo:'))
      .map((id) => id.slice('endo:'.length));
  } catch { return []; }
});

watch(
  [activeEndoSignals, chartFixedRange],
  ([signals, range]) => {
    if (!signals.length || !range) return;
    // Pass the Date instances directly so the sim window honors the
    // user's local timezone end-to-end (the composable converts to ms
    // before hitting the server). Sending YYYY-MM-DD strings would
    // shift the boundaries by the user's UTC offset.
    chartSeries.kickEndoSim({
      from: range.from,
      to: range.to,
      signals,
    });
  },
  { immediate: true },
);

// Time the food was eaten (HH:MM, local). Always populated when an
// entry's row is in edit mode; persisted as a full ISO timestamp on
// save so the simulation pipeline can place the meal at its real
// minute-of-day.
const editTime = ref('');

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
    // Exercise log fetches whether the feature is enabled or not — the
    // card just hides when disabled. Cheap query, simpler than gating
    // every loadAllForDate call site.
    exerciseLogStore.fetchDay(d),
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
    exercisesStore.fetchAll(),
    settingsStore.loaded ? Promise.resolve() : settingsStore.fetchSettings(),
  ]);
  // Quick-log deep-link handoff. QuickLogMenu pushes /log?action=… or
  // /log?focus=… to surface a modal or scroll target on land. Run after
  // stores hydrate so we can resolve compoundKey / metricId references.
  handleQuickLogDeepLink();
});

// Quick-log deep-link handlers --------------------------------------------
//
// The bottom-nav Log button opens a popover (QuickLogMenu) whose items
// push us back here with a query flag. We open the matching modal or
// scroll/focus the section, then strip the flag so a refresh doesn't
// re-trigger the action.
const doseModalOpen = ref(false);
const doseModalCompound = ref(null);
const doseModalValue = ref('');
const doseModalSaving = ref(false);
const doseModalInput = ref(null);

// Today vs. selected-date label for the quick-log modals. QuickLogMenu
// always navigates with today's date, so practically these modals
// always write to today — but if the user switches the page date with
// the modal already open, surface that instead of lying.
const quickLogDateLabel = computed(() => {
  const today = localYmd();
  if (date.value === today) return 'today';
  const [y, m, d] = String(date.value).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
});

const metricModalOpen = ref(false);
const metricModalMetric = ref(null);
const metricModalValue = ref('');
const metricModalSaving = ref(false);
const metricModalInput = ref(null);

function findCompoundByKey(key) {
  if (!key) return null;
  return enabledCompounds.value.find((c) => compoundKey(c) === key) || null;
}

function openDoseModal(compound) {
  if (!compound) return;
  doseModalCompound.value = compound;
  doseModalValue.value = '';
  doseModalOpen.value = true;
  nextTick(() => doseModalInput.value?.focus());
}

async function saveDoseModal() {
  const c = doseModalCompound.value;
  const raw = doseModalValue.value;
  if (!c || raw === '' || raw == null || Number.isNaN(Number(raw))) return;
  doseModalSaving.value = true;
  try {
    const compoundRef =
      c.source === 'core'
        ? { coreInterventionKey: c.coreInterventionKey }
        : { compoundId: c._id };
    await dosesStore.addDose({
      ...compoundRef,
      value: Number(raw),
      date: date.value,
    });
    doseModalOpen.value = false;
    doseModalCompound.value = null;
    doseModalValue.value = '';
  } finally {
    doseModalSaving.value = false;
  }
}

function openMetricModal(metric) {
  if (!metric) return;
  metricModalMetric.value = metric;
  metricModalValue.value = '';
  metricModalOpen.value = true;
  nextTick(() => metricModalInput.value?.focus());
}

async function saveMetricModal() {
  const m = metricModalMetric.value;
  const raw = metricModalValue.value;
  if (!m || raw === '' || raw == null || Number.isNaN(Number(raw))) return;
  metricModalSaving.value = true;
  try {
    const unit = metricDisplayUnit(m);
    const canonical = toCanonical(Number(raw), unit);
    await metricsStore.setValue(m._id, canonical);
    metricModalOpen.value = false;
    metricModalMetric.value = null;
    metricModalValue.value = '';
  } finally {
    metricModalSaving.value = false;
  }
}

function clearDeepLinkQuery() {
  // Strip action/focus/etc but preserve the active date so the page
  // doesn't reset to today on a back-dated session.
  router.replace({ path: '/log', query: { date: date.value } });
}

async function handleQuickLogDeepLink() {
  const q = route.query;
  if (q.action === 'add-exercise') {
    openExerciseModal();
    clearDeepLinkQuery();
    return;
  }
  if (q.action === 'add-dose') {
    const c = findCompoundByKey(q.compoundKey);
    if (c) openDoseModal(c);
    clearDeepLinkQuery();
    return;
  }
  if (q.action === 'add-metric') {
    const m = enabledMetrics.value.find((x) => x._id === q.metricId);
    if (m) openMetricModal(m);
    clearDeepLinkQuery();
    return;
  }
  // Hash-based jumps: the router's scrollBehavior already resolves
  // route.hash → section element scroll on both window (mobile) and
  // main.content (desktop). We just focus the most useful input inside
  // the section so a follow-up keypress lands on a logging control.
  await handleHashFocus();
}

async function handleHashFocus() {
  const hash = route.hash;
  if (!hash) return;
  await nextTick();
  const el = document.querySelector(hash);
  if (!el) return;
  if (hash === '#symptoms') {
    const dot = el.querySelector('.dot');
    dot?.focus({ preventScroll: true });
  } else if (hash === '#notes') {
    const ta = el.querySelector('textarea');
    ta?.focus({ preventScroll: true });
  } else if (hash === '#water') {
    const drop = el.querySelector('button:not([disabled])');
    drop?.focus({ preventScroll: true });
  }
  // #photos → scroll only; capture card has its own primary action.
}

// Re-trigger the deep-link handler whenever query/hash changes after
// mount — QuickLogMenu can fire while we're already on /log (tap Log →
// popover → pick item), and that path doesn't re-run onMounted.
watch(
  () => [route.query.action, route.query.compoundKey, route.query.metricId],
  () => {
    if (route.query.action) handleQuickLogDeepLink();
  },
);
watch(
  () => route.hash,
  () => {
    if (route.hash) handleHashFocus();
  },
);

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
  editTime.value = isoToLocalHHMM(entry.date) || nowLocalHHMM();
}

async function saveEdit(id) {
  const count = Number(editServings.value);
  if (count === 0) {
    await foodlogStore.deleteEntry(id);
    editingId.value = null;
    return;
  }
  // Combine the page's date with the modal's HH:MM into a local-time
  // ISO string. Editing time is optional — if unchanged from the
  // initial value the round-trip is a no-op on the server.
  const time = editTime.value || '12:00';
  const localISO = new Date(`${date.value}T${time}:00`).toISOString();
  await foodlogStore.updateEntry(id, { servingCount: count, date: localISO });
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

// Cycle banner — visible whenever menstrual tracking is on and the user
// chose to show it on the log page. When `lastPeriodStart` is missing
// we still render the shell so the user can tap "Period started" to
// backfill (or mark today). Phase math lives in shared/bio/menstruation
// so the agent reads the same values when reasoning about hormones.
import {
  cycleDayFor,
  phaseFor,
  isPeriodStartPlausible,
} from '../../../shared/bio/menstruation.js';
const cycleBanner = computed(() => {
  const m = settingsStore.settings?.menstruation;
  if (!m?.enabled || m.showOnLog === false) return null;
  // Cycle math is anchored to the *viewed* log day, not "today" — flipping
  // through past days needs to show that day's cycleDay/phase. UTC-noon
  // sidesteps tz boundary off-by-ones in dayDiff.
  const asOf = new Date(`${date.value}T12:00:00.000Z`);
  const cycleDay = m.lastPeriodStart ? cycleDayFor(m, asOf) : null;
  const phase = cycleDay != null
    ? phaseFor({
        cycleDay,
        cycleLength: m.cycleLength,
        lutealPhaseLength: m.lutealPhaseLength,
        periodLength: m.periodLength,
      })
    : null;
  const startYmd = m.lastPeriodStart
    ? new Date(m.lastPeriodStart).toISOString().slice(0, 10)
    : null;
  return {
    cycleDay,
    cycleLength: Math.max(15, Math.min(60, Number(m.cycleLength) || 28)),
    phase,
    hasStart: Boolean(m.lastPeriodStart),
    isStartDay: startYmd === date.value,
    plausible: isPeriodStartPlausible(m, asOf),
  };
});

// Mark the currently-viewed log date as the start of a new period.
// Confirms when an existing start would be overwritten — the cycle math
// downstream (and any Dashboard hormone series) keys off this date, so an
// accidental reset would shift the user's whole hormonal phase reading.
async function markPeriodStartedToday() {
  const m = settingsStore.settings?.menstruation || {};
  if (m.lastPeriodStart) {
    const ok = confirm('Replace your existing period start date?');
    if (!ok) return;
  }
  const iso = new Date(`${date.value}T12:00:00.000Z`).toISOString();
  await settingsStore.patchSettings({
    menstruation: { ...m, lastPeriodStart: iso },
  });
}
// Mode-aware in/out/net/target strip displayed under the daily nutrition
// summary. Returns null when there's no target to compare against (so
// the strip doesn't render a half-formed line). Modes:
//   baseline → target unchanged, burn shown for awareness
//   earn     → target = daily + today's burn
//   hidden   → only consumed vs target
const energyStrip = computed(() => {
  const t = settingsStore.settings?.targets;
  if (!t?.calories) return null;
  const ex = settingsStore.settings?.exercise;
  if (!ex?.enabled || ex.showOnLog === false) return null;
  const consumed = Math.round(foodlogStore.summary?.perServing?.calories || 0);
  const burned = exerciseEntriesToday.value.reduce(
    (sum, e) => sum + (e.caloriesBurned || 0),
    0,
  );
  const mode = settingsStore.settings?.exercise?.energyMode || 'baseline';
  const baseTarget = Math.round(t.calories);
  const target = mode === 'earn' ? baseTarget + Math.round(burned) : baseTarget;
  const net = consumed - Math.round(burned);
  const fmt = (n) => Math.round(n).toLocaleString();
  return {
    mode,
    consumed,
    burned: Math.round(burned),
    net,
    target,
    baseTarget,
    consumedFmt: fmt(consumed),
    burnedFmt: fmt(burned),
    netFmt: fmt(net),
    targetFmt: fmt(target),
    baseTargetFmt: fmt(baseTarget),
  };
});

// Exercise feature state. Card hidden unless tracking is enabled AND
// the user opted into the log surface.
const exerciseSettings = computed(() => settingsStore.settings?.exercise || {});
const exerciseEnabled = computed(() =>
  Boolean(exerciseSettings.value.enabled) && exerciseSettings.value.showOnLog !== false,
);
const exerciseEntriesToday = computed(() => exerciseLogStore.entriesFor(date.value));
const exerciseTotalBurn = computed(() =>
  exerciseEntriesToday.value.reduce((sum, e) => sum + (e.caloriesBurned || 0), 0),
);

// Modal state for adding / editing entries. `editing` holds the entry
// being edited (null = new). `mode` is the input style.
const exerciseModalOpen = ref(false);
const exerciseEditing = ref(null);
const exerciseMode = ref('quick'); // 'quick' | 'activity' | 'detailed'
const exerciseForm = reactive({
  exerciseId: null,
  label: '',
  engineClass: 'exercise_cardio',
  startTime: '',  // HH:MM, local. Empty = "now" on save for new entries.
  durationMin: 30,
  intensity: 1.0,
  caloriesBurned: null,
  distanceKm: null,
  sets: null,
  reps: null,
  weightKg: null,
  notes: '',
});

// Activity typeahead state. exerciseSearchQuery drives the debounced
// filter; filteredActivityResults runs against the in-memory catalog.
// Recents come from the store via exercisesStore.recents.
const exerciseSearchQuery = ref('');
const filteredActivityResults = computed(() =>
  exercisesStore.search(exerciseSearchQuery.value),
);
const pickedActivityRow = computed(() =>
  exerciseForm.exerciseId ? exercisesStore.getById(exerciseForm.exerciseId) : null,
);
function clearPickedActivity() {
  exerciseForm.exerciseId = null;
  exerciseForm.label = '';
}
function exerciseClassLabel(cls) {
  return ({
    exercise_cardio: 'Cardio',
    exercise_resistance: 'Resistance',
    exercise_hiit: 'HIIT',
    exercise_recovery: 'Recovery',
  })[cls] || '';
}

// Today's calorie target after applying the energy-mode policy.
// Delegates to the shared reducer so the agent + server reasoning
// stay in lockstep with the UI's effective number.
const effectiveCalTargetToday = computed(() => {
  const baseTarget = Number(foodlogStore.summary?.targets?.calories) || 0;
  const burn = exerciseEntriesToday.value.reduce(
    (sum, e) => sum + (Number(e.caloriesBurned) || 0),
    0,
  );
  return effectiveDailyCalTarget({
    baseTarget,
    burnedKcal: burn,
    energyMode: settingsStore.settings?.exercise?.energyMode || 'baseline',
  });
});

// Live MET-based kcal preview. Same shared computeKcal the server
// runs on save, so what the user sees in the modal is what gets
// stored once they hit Log it.
const previewKcal = computed(() => {
  const dur = Number(exerciseForm.durationMin);
  if (!Number.isFinite(dur) || dur < 1) return null;
  const exercise = exerciseForm.exerciseId
    ? exercisesStore.getById(exerciseForm.exerciseId)
    : null;
  const metValue = Number(exercise?.metValue) || defaultMetForClass(exerciseForm.engineClass);
  const weightLbs = Number(settingsStore.settings?.currentWeightLbs) > 0
    ? Number(settingsStore.settings.currentWeightLbs)
    : 165;
  return sharedComputeKcal({
    metValue,
    weightLbs,
    durationMin: dur,
    intensity: exerciseForm.intensity,
  });
});

// Extract local-time HH:MM from a stored ISO timestamp. Used by the
// modal's <input type="time"> which always wants 24h. Display rows
// use formatLocalTime12h for the user-facing read-out.
function isoToLocalHHMM(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function nowLocalHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Display-only 12-hour clock with am/pm suffix, no leading zero on
// the hour. "7:41 PM" rather than "19:41".
function formatLocalTime12h(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

// Friendly duration formatter. Anything over 2 hours collapses to
// "Xh" or "Xh Ym"; under that we keep minutes — surfacing a 90-minute
// hike as "1h 30m" obscures gym-set granularity.
function formatDuration(min) {
  const n = Math.max(0, Math.round(Number(min) || 0));
  if (n < 120) return `${n} min`;
  const hours = Math.floor(n / 60);
  const rem = n % 60;
  return rem === 0 ? `${hours}h` : `${hours}h ${rem}m`;
}

// Resolve the catalog row for an ExerciseLog entry to surface its
// icon — falls back to a class-based emoji for free-form / legacy
// rows whose exerciseId is null.
function iconForEntry(entry) {
  if (entry.exerciseId) {
    const ex = exercisesStore.getById(entry.exerciseId);
    if (ex?.icon) return ex.icon;
  }
  return ({
    exercise_cardio: '🏃',
    exercise_resistance: '🏋️',
    exercise_hiit: '🔥',
    exercise_recovery: '🧘',
  })[entry.engineClass] || '·';
}

function openExerciseModal(entry = null) {
  exerciseEditing.value = entry;
  exerciseSearchQuery.value = '';
  // Refresh the recents list each time the modal opens so newly logged
  // entries surface near the top on subsequent opens.
  exercisesStore.fetchRecents().catch(() => {});
  if (entry) {
    // Infer mode from populated fields. Custom (detailed) wins if any
    // set/rep/weight/distance is set; otherwise default to activity
    // (handles both catalog-picked rows and legacy quick-mode entries).
    const hasDetail = entry.sets || entry.reps || entry.weightKg || entry.distanceKm;
    exerciseMode.value = hasDetail ? 'detailed' : 'activity';
    Object.assign(exerciseForm, {
      exerciseId: entry.exerciseId || null,
      label: entry.label || '',
      engineClass: entry.engineClass,
      startTime: isoToLocalHHMM(entry.date),
      durationMin: entry.durationMin,
      intensity: entry.intensity,
      caloriesBurned: entry.caloriesBurned,
      distanceKm: entry.distanceKm,
      sets: entry.sets,
      reps: entry.reps,
      weightKg: entry.weightKg,
      notes: entry.notes || '',
    });
  } else {
    exerciseMode.value = 'activity';
    Object.assign(exerciseForm, {
      exerciseId: null,
      label: '',
      engineClass: 'exercise_cardio',
      startTime: nowLocalHHMM(),
      durationMin: 30,
      intensity: 1.0,
      caloriesBurned: null,
      distanceKm: null,
      sets: null,
      reps: null,
      weightKg: null,
      notes: '',
    });
  }
  exerciseModalOpen.value = true;
}

function pickExerciseFromCatalog(ex) {
  exerciseForm.exerciseId = ex._id;
  exerciseForm.label = ex.name;
  exerciseForm.engineClass = ex.engineClass;
  exerciseForm.durationMin = ex.defaultDurationMin || 30;
  exerciseForm.intensity = ex.defaultIntensity || 1.0;
  // Reset caloriesBurned so server recomputes from the new MET.
  exerciseForm.caloriesBurned = null;
}

async function saveExerciseEntry() {
  // Defensive fallback — derive a label from the engine class so an
  // empty label never silently no-ops the save (Quick mode has no
  // label input, and the user may not have re-tapped a class button).
  if (!exerciseForm.label?.trim()) {
    exerciseForm.label = ({
      exercise_cardio: 'Cardio',
      exercise_resistance: 'Resistance',
      exercise_hiit: 'HIIT',
      exercise_recovery: 'Recovery',
    })[exerciseForm.engineClass] || 'Exercise';
  }
  // Combine the log page's date (YYYY-MM-DD) with the modal's HH:MM.
  // `new Date('2026-01-15T08:30')` parses as local time — exactly what
  // the user means when they pick "08:30" for a Jan 15 workout.
  const time = exerciseForm.startTime || '12:00';
  const localISO = new Date(`${date.value}T${time}:00`).toISOString();

  // Normalize optional numeric fields. Vue's `v-model.number` returns
  // the raw empty string when an input is cleared (parseFloat("") is
  // NaN, which the directive declines to coerce). Sending "" to the
  // server would set the schema field to 0, not trigger the auto
  // recompute path. Coerce empty/NaN/null → null explicitly.
  const optNum = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const payload = {
    exerciseId: exerciseForm.exerciseId,
    label: exerciseForm.label.trim(),
    engineClass: exerciseForm.engineClass,
    durationMin: Number(exerciseForm.durationMin),
    intensity: Number(exerciseForm.intensity),
    caloriesBurned: optNum(exerciseForm.caloriesBurned),
    distanceKm: optNum(exerciseForm.distanceKm),
    sets: optNum(exerciseForm.sets),
    reps: optNum(exerciseForm.reps),
    weightKg: optNum(exerciseForm.weightKg),
    notes: exerciseForm.notes,
    date: localISO,
  };
  if (exerciseEditing.value) {
    await exerciseLogStore.update(exerciseEditing.value._id, payload);
  } else {
    await exerciseLogStore.create(payload);
  }
  exerciseModalOpen.value = false;
}

async function deleteExerciseEntry(entry) {
  if (!confirm(`Delete "${entry.label}"?`)) return;
  await exerciseLogStore.remove(entry._id);
}

const waterEnabled = computed(() => Boolean(waterSettings.value.enabled));
const journalEnabled = computed(
  () => settingsStore.settings?.journal?.enabled !== false,
);
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

// Stable identity key for both canonical (`core:<key>`) and custom
// (compound _id) rows. Used for keyed Pinia state maps + `:key`
// loops since canonical rows have no `_id`.
function compoundKey(c) {
  if (!c) return null;
  return c.source === 'core' ? `core:${c.coreInterventionKey}` : c._id;
}

function todaysDoseFor(compound) {
  return dosesStore.todaysDoseFor(compound, date.value);
}

// "Next dose" label for a single compound, anchored on its own intervalDays
// and its own latest dose (regardless of selected page date).
function nextDoseLabelFor(compound) {
  const latest = dosesStore.latestDoseFor(compound);
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
  const k = compoundKey(compound);
  const raw = newDoseByCompound[k];
  if (raw === '' || raw == null) return;
  savingDoseByCompound[k] = true;
  try {
    // Canonical compounds dose by intervention key; custom by _id.
    // The store hides the polymorphism — pass exactly one of the refs.
    const ref = compound.source === 'core'
      ? { coreInterventionKey: compound.coreInterventionKey }
      : { compoundId: compound._id };
    await dosesStore.addDose({
      ...ref,
      value: Number(raw),
      date: date.value,
    });
    newDoseByCompound[k] = '';
  } finally {
    savingDoseByCompound[k] = false;
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
    <div v-if="cycleBanner" class="cycle-banner">
      <span v-if="cycleBanner.hasStart" class="cycle-banner-day">
        Day {{ cycleBanner.cycleDay }} / {{ cycleBanner.cycleLength }}
      </span>
      <span v-else class="cycle-banner-day cycle-banner-empty">
        No period start logged
      </span>
      <span v-if="cycleBanner.phase" class="cycle-banner-phase">
        {{ cycleBanner.phase }}
      </span>
      <button
        v-if="cycleBanner.plausible"
        type="button"
        class="cycle-banner-btn"
        @click="markPeriodStartedToday"
      >
        Period started {{ date === localYmd() ? 'today' : 'this day' }}
      </button>
    </div>
    <DateSelector v-model="date" />

    <!-- =========================================================== -->
    <!-- WATER (drop row, conditional)                                -->
    <!-- =========================================================== -->
    <div v-if="waterEnabled" id="water" class="meal-card compact water-card">
      <div class="water-head">
        <h3 class="water-title">Water</h3>
        <span class="water-total" :class="{ hit: waterGoalHit }">
          {{ waterTotalDisplay }} / {{ waterTargetDisplay }}
          {{ waterUnitLabel }}
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
      <!-- effectiveCalTarget: in `earn` energy mode, today's burn
           extends today's calorie target. Passing the adjusted number
           down keeps the MacroBar + suggestion copy in sync with the
           weekly budget math (which already bumps via useWeeklyBudget). -->
      <DailySummary
        :summary="foodlogStore.summary"
        :effective-cal-target="effectiveCalTargetToday"
      />

      <!-- Mode-aware energy strip. Shows in/out/net/target per the
           user's exercise.energyMode. Hidden mode collapses to a
           plain consumed/target line. See docs/exercise-energy-modes.md. -->
      <div
        v-if="energyStrip"
        class="energy-strip"
        :class="`mode-${energyStrip.mode}`"
      >
        <template v-if="energyStrip.mode === 'hidden'">
          <span class="es-num">{{ energyStrip.consumedFmt }}</span>
          <span class="es-sep">·</span>
          <span class="es-tgt">target {{ energyStrip.targetFmt }}</span>
        </template>
        <template v-else>
          <span class="es-num">{{ energyStrip.consumedFmt }}</span>
          <span class="es-lbl">in</span>
          <span class="es-sep">·</span>
          <span class="es-num">{{ energyStrip.burnedFmt }}</span>
          <span class="es-lbl">out</span>
          <span class="es-sep">→</span>
          <span class="es-net">{{ energyStrip.netFmt }}</span>
          <span class="es-lbl">net</span>
          <span class="es-spacer" />
          <span class="es-tgt">
            target
            {{ energyStrip.targetFmt



            }}<span
              v-if="energyStrip.mode === 'earn' && energyStrip.burned > 0"
              class="es-tgt-detail"
            >
              ({{ energyStrip.baseTargetFmt }} + {{ energyStrip.burnedFmt }})
            </span>
          </span>
        </template>
      </div>
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
    <div v-if="enabledMetrics.length" id="metrics" class="meal-card compact">
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
            <button class="delete-btn" @click="handleDeleteMetric(metric)">
              x
            </button>
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
        :key="compoundKey(compound)"
        class="compound-row"
        v-tooltip="`Log ${compound.name} dose`"
      >
        <div class="metric-label">{{ compound.name }}</div>
        <form
          v-if="!todaysDoseFor(compound)"
          class="quick-form"
          @submit.prevent="handleAddDose(compound)"
        >
          <input
            type="number"
            v-model.number="newDoseByCompound[compoundKey(compound)]"
            step="0.25"
            :placeholder="compound.doseUnit"
            required
            @focus="doseInputFocused[compoundKey(compound)] = true"
            @blur="doseInputFocused[compoundKey(compound)] = false"
          />
          <button
            class="btn-primary"
            :class="{
              muted:
                !doseInputFocused[compoundKey(compound)] &&
                !newDoseByCompound[compoundKey(compound)],
            }"
            type="submit"
            :disabled="savingDoseByCompound[compoundKey(compound)]"
          >
            {{ savingDoseByCompound[compoundKey(compound)] ? 'Saving...' : 'Log' }}
          </button>
        </form>
        <div v-else class="logged-row">
          <span class="logged-value">
            {{ todaysDoseFor(compound).value }} {{ compound.doseUnit }}
          </span>
          <button
            class="delete-btn"
            @click="handleDeleteDose(todaysDoseFor(compound))"
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
    <!--  LOG                                                     -->
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
                      <div class="edit-stack" @click.stop>
                        <input
                          type="number"
                          v-model.number="editServings"
                          min="0"
                          step="0.25"
                          class="edit-input"
                          @keyup.enter="saveEdit(row.entry._id)"
                          @keyup.escape="cancelEdit"
                        />
                        <input
                          type="time"
                          v-model="editTime"
                          class="edit-time"
                          @keyup.enter="saveEdit(row.entry._id)"
                          @keyup.escape="cancelEdit"
                        />
                        <button
                          class="save-btn"
                          @click.stop="saveEdit(row.entry._id)"
                        >
                          ✓
                        </button>
                      </div>
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
                      <span class="row-prefix">
                        <span
                          class="caret"
                          >{{ isCollapsed(meal.key, row.mealId) ? '▸' : '▾' }}</span
                        >
                        <span
                          v-if="row.mealEmoji"
                          class="entry-emoji"
                          >{{ row.mealEmoji }}</span
                        >
                      </span>
                      <span class="group-name"
                        >{{ row.mealName }}
                        <span class="group-count"
                          >{{ row.entries.length }}
                          item{{ row.entries.length === 1 ? '' : 's' }}</span
                        ></span
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
                          v-if="child.foodItemId?.emoji"
                          class="entry-emoji"
                          >{{ child.foodItemId.emoji }}</span
                        >
                        <span
                          class="entry-name"
                          :class="{ planned: child.consumed === false }"
                          >{{ child.foodItemId?.name
                          }}<span
                            v-if="child.consumed === false"
                            class="planned-tag"
                          >
                            (planned)</span
                          ></span
                        >
                      </td>
                      <td class="col-srv">
                        <template v-if="editingId === child._id">
                          <div class="edit-stack" @click.stop>
                            <input
                              type="number"
                              v-model.number="editServings"
                              min="0"
                              step="0.25"
                              class="edit-input"
                              @keyup.enter="saveEdit(child._id)"
                              @keyup.escape="cancelEdit"
                            />
                            <input
                              type="time"
                              v-model="editTime"
                              class="edit-time"
                              @keyup.enter="saveEdit(child._id)"
                              @keyup.escape="cancelEdit"
                            />
                            <button
                              class="save-btn"
                              @click.stop="saveEdit(child._id)"
                            >
                              ✓
                            </button>
                          </div>
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
    <!-- EXERCISE (conditional on settings.exercise.enabled+showOnLog) -->
    <!-- =========================================================== -->
    <div
      v-if="exerciseEnabled"
      id="exercise"
      class="meal-card compact exercise-card"
    >
      <div class="exercise-head">
        <h3 class="exercise-title">Exercise</h3>
        <span class="exercise-total"
          >{{ Number(exerciseTotalBurn).toLocaleString() }} kcal burned</span
        >
      </div>
      <div v-if="exerciseEntriesToday.length" class="exercise-list">
        <button
          v-for="entry in exerciseEntriesToday"
          :key="entry._id"
          type="button"
          class="exercise-row"
          @click="openExerciseModal(entry)"
        >
          <span class="ex-row-time">{{ formatLocalTime12h(entry.date) }}</span>
          <span class="ex-row-icon">{{ iconForEntry(entry) }}</span>
          <span class="ex-row-label">{{ entry.label }}</span>
          <span
            class="ex-row-class"
            >{{ exerciseClassLabel(entry.engineClass) }}</span
          >
          <span class="ex-row-detail">
            {{ formatDuration(entry.durationMin) }} ·
            {{ Number(entry.intensity).toFixed(1) }}×
          </span>
          <span class="ex-row-burn"
            >{{ Number(entry.caloriesBurned || 0).toLocaleString() }} kcal</span
          >
          <button
            type="button"
            class="ex-row-del"
            aria-label="Delete"
            @click.stop="deleteExerciseEntry(entry)"
          >
            ×
          </button>
        </button>
      </div>
      <button type="button" class="exercise-add" @click="openExerciseModal()">
        + Add exercise
      </button>
    </div>

    <!-- Exercise modal — quick / activity / detailed input modes -->
    <div
      v-if="exerciseModalOpen"
      class="modal-backdrop"
      @click.self="exerciseModalOpen = false"
    >
      <div class="modal exercise-modal">
        <h3>{{ exerciseEditing ? 'Edit exercise' : 'Log exercise' }}</h3>

        <div class="mode-tabs">
          <button
            type="button"
            class="mode-tab"
            :class="{ active: exerciseMode === 'activity' }"
            @click="exerciseMode = 'activity'"
          >
            Activity
          </button>
          <button
            type="button"
            class="mode-tab"
            :class="{ active: exerciseMode === 'detailed' }"
            @click="exerciseMode = 'detailed'"
          >
            Custom
          </button>
        </div>

        <!-- Activity mode: typeahead over the full catalog. Recents
             show by default; typing filters case-insensitively with
             prefix matches ranked above substring matches. -->
        <template v-if="exerciseMode === 'activity'">
          <label class="form-row activity-search-row">
            <span>Activity</span>
            <input
              v-model="exerciseSearchQuery"
              type="text"
              placeholder="Search activities…"
              autocomplete="off"
            />
          </label>
          <div v-if="exerciseForm.exerciseId" class="picked-activity">
            <span
              class="picked-icon"
              >{{ pickedActivityRow?.icon || '·' }}</span
            >
            <span
              class="picked-name"
              >{{ pickedActivityRow?.name || exerciseForm.label }}</span
            >
            <span class="picked-meta">
              MET {{ pickedActivityRow?.metValue || '—' }}
            </span>
            <button
              type="button"
              class="picked-clear"
              title="Clear selection"
              @click="clearPickedActivity"
            >
              ×
            </button>
          </div>
          <div
            v-else-if="!exerciseSearchQuery && exercisesStore.recents.length"
            class="activity-section"
          >
            <div class="activity-section-head">Recent</div>
            <button
              v-for="ex in exercisesStore.recents"
              :key="ex._id"
              type="button"
              class="activity-row"
              @click="pickExerciseFromCatalog(ex)"
            >
              <span class="activity-icon">{{ ex.icon || '·' }}</span>
              <span class="activity-name">{{ ex.name }}</span>
              <span
                class="activity-meta"
                >{{ exerciseClassLabel(ex.engineClass) }}</span
              >
            </button>
          </div>
          <div v-if="!exerciseForm.exerciseId" class="activity-section">
            <div class="activity-section-head">
              {{ exerciseSearchQuery ? 'Matches' : 'All activities' }}
              <span
                v-if="filteredActivityResults.length"
                class="activity-count"
              >
                {{ filteredActivityResults.length }}
              </span>
            </div>
            <button
              v-for="ex in filteredActivityResults"
              :key="ex._id"
              type="button"
              class="activity-row"
              @click="pickExerciseFromCatalog(ex)"
            >
              <span class="activity-icon">{{ ex.icon || '·' }}</span>
              <span class="activity-name">{{ ex.name }}</span>
              <span
                class="activity-meta"
                >{{ exerciseClassLabel(ex.engineClass) }}</span
              >
            </button>
            <p v-if="!filteredActivityResults.length" class="activity-empty">
              No matches. Switch to "Custom" to log a free-form workout.
            </p>
          </div>
        </template>

        <!-- Detailed mode: full form -->
        <template v-if="exerciseMode === 'detailed'">
          <label class="form-row">
            <span>Activity (optional)</span>
            <select
              :value="exerciseForm.exerciseId || ''"
              @change="(e) => {
                const ex = exercisesStore.getById(e.target.value);
                if (ex) pickExerciseFromCatalog(ex);
                else { exerciseForm.exerciseId = null; }
              }"
            >
              <option value="">— free-form —</option>
              <option
                v-for="ex in exercisesStore.enabled"
                :key="ex._id"
                :value="ex._id"
              >
                {{ ex.icon || '·' }} {{ ex.name }}
              </option>
            </select>
          </label>
          <label class="form-row">
            <span>Label</span>
            <input
              v-model="exerciseForm.label"
              type="text"
              placeholder="e.g. Morning run"
            />
          </label>
          <div class="form-grid-2">
            <label class="form-row">
              <span>Class</span>
              <select v-model="exerciseForm.engineClass">
                <option value="exercise_cardio">Cardio</option>
                <option value="exercise_resistance">Resistance</option>
                <option value="exercise_hiit">HIIT</option>
                <option value="exercise_recovery">Recovery</option>
              </select>
            </label>
            <label class="form-row">
              <span>Distance (km)</span>
              <input
                v-model.number="exerciseForm.distanceKm"
                type="number"
                min="0"
                step="0.1"
              />
            </label>
          </div>
          <div class="form-grid-3">
            <label class="form-row">
              <span>Sets</span>
              <input
                v-model.number="exerciseForm.sets"
                type="number"
                min="0"
                step="1"
              />
            </label>
            <label class="form-row">
              <span>Reps</span>
              <input
                v-model.number="exerciseForm.reps"
                type="number"
                min="0"
                step="1"
              />
            </label>
            <label class="form-row">
              <span>Weight (kg)</span>
              <input
                v-model.number="exerciseForm.weightKg"
                type="number"
                min="0"
                step="0.5"
              />
            </label>
          </div>
          <label class="form-row">
            <span>Notes</span>
            <input v-model="exerciseForm.notes" type="text" placeholder="" />
          </label>
        </template>

        <!-- Always present: started-at, duration, intensity, override burn -->
        <div class="form-grid-3">
          <label class="form-row">
            <span>Started at</span>
            <input v-model="exerciseForm.startTime" type="time" />
          </label>
          <label class="form-row">
            <span>Duration (min)</span>
            <input
              v-model.number="exerciseForm.durationMin"
              type="number"
              min="1"
              step="5"
            />
          </label>
          <label class="form-row">
            <span>Intensity (0.5–1.5)</span>
            <input
              v-model.number="exerciseForm.intensity"
              type="number"
              min="0.5"
              max="1.5"
              step="0.1"
            />
          </label>
        </div>

        <label class="form-row">
          <span>
            Calories burned
            <span
              v-if="exerciseForm.caloriesBurned == null && previewKcal != null"
              class="form-hint"
            >
              ≈ {{ previewKcal.toLocaleString() }} kcal · MET × weight × time ×
              intensity
            </span>
            <span v-else class="form-hint"
              >(blank → auto from MET × weight × time)</span
            >
          </span>
          <input
            v-model.number="exerciseForm.caloriesBurned"
            type="number"
            min="0"
            step="1"
            :placeholder="previewKcal != null ? String(previewKcal) : 'auto'"
          />
        </label>

        <div class="modal-actions">
          <button
            type="button"
            class="btn-cancel"
            @click="exerciseModalOpen = false"
          >
            Cancel
          </button>
          <button type="button" class="btn-primary" @click="saveExerciseEntry">
            {{ exerciseEditing ? 'Save' : 'Log it' }}
          </button>
        </div>
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
    <div v-if="journalEnabled" id="notes" class="meal-card">
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

    <!-- =========================================================== -->
    <!-- CHART (24h, multi-series) — anchored at the bottom so the    -->
    <!-- log's event-entry surfaces stay above the fold.              -->
    <!-- =========================================================== -->
    <div class="meal-card chart-card">
      <SignalChart
        :series-by-category="chartSeries.seriesByCategory.value"
        :get-data-points="chartSeries.getDataPoints"
        :default-active="[]"
        :fixed-range="chartFixedRange"
        storage-key="log-chart"
        :loading="chartSeries.endoSim.busy.value && activeEndoSignals.length > 0"
        empty-text="Add a series to see how it moved through this day."
      />
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

    <!-- Quick-log dose modal — deep-linked from QuickLogMenu. The inline
         compounds card stays as the primary surface; this modal exists so
         the bottom-nav popover can land users on a focused single-input
         prompt with no extra taps. -->
    <div
      v-if="doseModalOpen"
      class="modal-backdrop"
      @click.self="doseModalOpen = false"
    >
      <div class="modal quick-log-modal">
        <h3>
          Log {{ doseModalCompound?.name }}
          <span
            v-if="doseModalCompound?.doseUnit"
            class="quick-log-unit-hint"
            >({{ doseModalCompound.doseUnit }})</span
          >
          <span class="quick-log-date">{{ quickLogDateLabel }}</span>
        </h3>
        <form class="quick-log-form" @submit.prevent="saveDoseModal">
          <input
            ref="doseModalInput"
            v-model="doseModalValue"
            type="number"
            step="0.25"
            inputmode="decimal"
            :placeholder="doseModalCompound?.doseUnit || 'Dose'"
            required
            class="quick-log-input"
          />
          <div class="modal-actions">
            <button
              type="button"
              class="btn-cancel"
              @click="doseModalOpen = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="btn-primary"
              :disabled="doseModalSaving || !doseModalValue"
            >
              {{ doseModalSaving ? 'Saving…' : 'Log it' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Quick-log measurement modal — same shape as the dose modal, with
         the metric's display unit driving placeholder + canonical convert. -->
    <div
      v-if="metricModalOpen"
      class="modal-backdrop"
      @click.self="metricModalOpen = false"
    >
      <div class="modal quick-log-modal">
        <h3>
          Log {{ metricModalMetric?.name }}
          <span
            v-if="metricModalMetric"
            class="quick-log-unit-hint"
            >({{ unitLabel(metricDisplayUnit(metricModalMetric)) || metricModalMetric.dimension }})</span
          >
          <span class="quick-log-date">{{ quickLogDateLabel }}</span>
        </h3>
        <form class="quick-log-form" @submit.prevent="saveMetricModal">
          <input
            ref="metricModalInput"
            v-model="metricModalValue"
            type="number"
            step="0.1"
            inputmode="decimal"
            :placeholder="unitLabel(metricDisplayUnit(metricModalMetric)) || metricModalMetric?.dimension || ''"
            required
            class="quick-log-input"
          />
          <div class="modal-actions">
            <button
              type="button"
              class="btn-cancel"
              @click="metricModalOpen = false"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="btn-primary"
              :disabled="metricModalSaving || !metricModalValue"
            >
              {{ metricModalSaving ? 'Saving…' : 'Log it' }}
            </button>
          </div>
        </form>
      </div>
    </div>
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
/* Mode-aware energy strip — sits under the DailySummary card to
   surface in/out/net/target with one honest line. Mode determines
   whether burn shows and whether target is offset. */
.energy-strip {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 6px;
  padding: var(--space-2) var(--space-4);
  margin-top: var(--space-2);
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}
.energy-strip .es-num,
.energy-strip .es-net {
  color: var(--text);
  font-weight: var(--font-weight-medium);
}
.energy-strip .es-net { color: var(--text); }
.energy-strip .es-lbl {
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-family: var(--font-display);
  font-size: 10px;
}
.energy-strip .es-sep { color: var(--text-tertiary); }
.energy-strip .es-spacer { flex: 1; }
.energy-strip .es-tgt { color: var(--text-secondary); }
.energy-strip .es-tgt-detail {
  margin-left: 4px;
  color: var(--text-tertiary);
  font-size: 10px;
}

.cycle-banner {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1em;
  padding: var(--space-2) var(--space-4);
  margin-bottom: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: var(--font-size-xs);
}
.cycle-banner-day {
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  color: var(--text-secondary);
}
.cycle-banner-phase {
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.cycle-banner-empty {
  color: var(--text-tertiary);
  font-family: inherit;
  font-style: italic;
}
.cycle-banner-btn {
  margin-left: auto;
  padding: 0.25rem 0.6rem;
  background: var(--bg);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.cycle-banner-btn:hover {
  background: var(--surface-raised);
  color: var(--text);
}
.water-card { padding: var(--space-3) var(--space-5); }

/* Exercise card — same shell as water-card; rows are tappable to edit. */
.exercise-card { padding: var(--space-3) var(--space-5); }
.exercise-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
.exercise-title {
  margin: 0;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.exercise-total {
  font-size: var(--font-size-s);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}
.exercise-list {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--space-2);
}
.exercise-row {
  display: grid;
  grid-template-columns: auto auto 1fr auto auto auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 0;
  background: transparent;
  border: none;
  border-top: 1px solid var(--border);
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: var(--text);
}
.exercise-row:first-of-type { border-top: none; }
.exercise-row:hover { background: var(--bg); }
.ex-row-icon {
  font-size: var(--font-size-m);
  width: 22px;
  text-align: center;
  margin-right: -4px;
}
.ex-row-time {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  min-width: 64px;
  white-space: nowrap;
}
.ex-row-label {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ex-row-class {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  border: 1px solid var(--border);
  padding: 2px 6px;
  font-family: var(--font-display);
  white-space: nowrap;
}
.ex-row-detail {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.ex-row-burn {
  font-size: var(--font-size-s);
  color: var(--text);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
.ex-row-del {
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: var(--font-size-l);
  line-height: 1;
}
.ex-row-del:hover { color: var(--danger); }
.exercise-add {
  width: 100%;
  padding: 8px;
  background: transparent;
  border: 1px dashed var(--border);
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
}
.exercise-add:hover { color: var(--text); border-color: var(--text-tertiary); }

/* Exercise modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: grid;
  place-items: center;
  z-index: 200;
}
.exercise-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: var(--space-5);
  width: 92%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
}
.exercise-modal h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
}
.mode-tabs {
  display: flex;
  gap: 2px;
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 2px;
  margin-bottom: var(--space-3);
}
.mode-tab {
  flex: 1;
  padding: 6px 0;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  font-family: inherit;
}
.mode-tab.active {
  background: var(--surface);
  color: var(--text);
  font-weight: var(--font-weight-medium);
}

.activity-search-row { margin-bottom: var(--space-2); }

.picked-activity {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--primary);
  background: var(--primary-soft);
  margin-bottom: var(--space-3);
}
.picked-icon { font-size: var(--font-size-m); }
.picked-name {
  flex: 1;
  font-size: var(--font-size-s);
  color: var(--text);
  font-weight: var(--font-weight-medium);
}
.picked-meta {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}
.picked-clear {
  background: transparent;
  border: 0;
  color: var(--text-tertiary);
  font-size: var(--font-size-l);
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
}
.picked-clear:hover { color: var(--text); }

.activity-section {
  margin-bottom: var(--space-3);
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--border);
  background: var(--bg);
}
.activity-section-head {
  position: sticky;
  top: 0;
  background: var(--bg);
  padding: 6px var(--space-2);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.activity-count {
  margin-left: auto;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
  color: var(--text-tertiary);
  text-transform: none;
  letter-spacing: 0;
  font-family: var(--font-mono);
}
.activity-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: var(--space-2);
  padding: 8px var(--space-2);
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: var(--font-size-s);
  color: var(--text);
}
.activity-row:last-child { border-bottom: 0; }
.activity-row:hover { background: var(--surface-raised); }
.activity-icon {
  width: 22px;
  text-align: center;
  font-size: var(--font-size-m);
}
.activity-name { flex: 1; }
.activity-meta {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}
.activity-empty {
  padding: var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  text-align: center;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: var(--space-3);
}
.form-row > span {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.form-row .form-hint {
  text-transform: none;
  letter-spacing: 0;
  font-weight: var(--font-weight-regular);
  color: var(--text-tertiary);
  margin-left: 4px;
}
.form-row input,
.form-row select {
  padding: 6px 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: var(--font-size-s);
  color: var(--text);
  font-family: var(--font-mono);
}
.form-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}
.form-grid-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--space-2);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.btn-cancel,
.btn-primary {
  padding: 8px 16px;
  font-size: var(--font-size-s);
  cursor: pointer;
  border: 1px solid var(--border);
}
.btn-cancel { background: var(--surface); color: var(--text-secondary); }
.btn-primary { background: var(--primary); color: var(--primary-fg, #fff); border-color: var(--primary); }
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
.edit-stack {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.edit-time {
  width: 78px;
  padding: 0.15rem var(--space-1);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
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
.group-child td.col-name { padding-left: var(--space-4); }
.group-child td { background: var(--tint-carbs-softest); }
.row-prefix { display: inline; }

/* Mobile: each tr becomes a grid with shared columns so headers align
   with the metric values below them.
     col 1   — checkbox / empty (its own column)
     cols 2–6 — Srv | Kcal | Pro | Fat | Carb
     col 7   — menu / empty
   Entry rows place the title on row 1 spanning cols 2–6 (single line +
   ellipsis), metrics on row 2 sitting directly under their headers. */
@media (max-width: 600px) {
  .meal-table thead tr,
  .meal-table tbody tr.entry-row,
  .meal-table tbody tr.meal-group-header,
  .meal-table tfoot tr {
    display: grid;
    /* 8 columns: check | prefix (emoji/caret) | 5 metric cols | menu.
       The prefix column is a fixed width so the title text — and the
       header/value columns under it — start at the same x on every
       row regardless of whether that row has an emoji, caret, or
       nothing at all. */
    grid-template-columns: 15px 1.75rem repeat(5, 1fr) 1.75rem;
    align-items: center;
    column-gap: var(--space-1);
  }

  /* Header row: hide the "Item" label (the title spans this area in
     each entry row); other headers sit in cols 2-6. */
  .meal-table thead th {
    padding: var(--space-1);
    width: auto;
    text-align: left;
  }
  .meal-table thead th.col-check { grid-column: 1; }
  .meal-table thead th.col-name { display: none; }
  .meal-table thead th.col-srv { grid-column: 3; }
  .meal-table thead th.col-num:not(.col-p):not(.col-f):not(.col-c) { grid-column: 4; }
  .meal-table thead th.col-p { grid-column: 5; }
  .meal-table thead th.col-f { grid-column: 6; }
  .meal-table thead th.col-c { grid-column: 7; }
  .meal-table thead th.col-del { grid-column: 8; }

  /* Body rows: 2-row grid (title above metrics). Check + menu span
     both rows so they sit centered next to the stacked content. The
     prefix (emoji/caret) only spans row 1 so it stays aligned with
     the title text rather than floating between the two rows. */
  .meal-table tbody tr.entry-row,
  .meal-table tbody tr.meal-group-header {
    grid-template-areas:
      "check prefix name name name name name menu"
      "check .      srv  cal  p    f    c    menu";
    row-gap: 2px;
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--border);
  }
  .meal-table tbody tr.entry-row:last-child,
  .meal-table tbody tr.meal-group-header:last-child { border-bottom: none; }

  /* Footer (Total): single-row grid — "Total" sits in the servings
     column (col 3, where the title text begins on entry rows). */
  .meal-table tfoot tr {
    grid-template-areas: "check . name cal p f c menu";
    padding: var(--space-2) 0;
  }
  .meal-table tfoot td.col-srv { display: none; }

  .meal-table tbody td,
  .meal-table tfoot td {
    display: block;
    width: auto;
    min-width: 0;
    padding: 0 var(--space-1);
    border-bottom: none;
    text-align: left;
  }
  .meal-table td.col-check { grid-area: check; padding: 0; }
  .meal-table th.col-check { padding: 0; }
  /* Promote col-name's children directly into the row's grid so
     emoji/caret land in the prefix column and the title text lands in
     the name column (which the metrics align under). */
  .meal-table tbody td.col-name {
    display: contents;
  }
  .meal-table tbody td.col-name > .entry-emoji,
  .meal-table tbody td.col-name > .row-prefix {
    grid-area: prefix;
    text-align: right;
    padding: 0;
    margin: 0;
  }
  .meal-table tbody td.col-name > .entry-name,
  .meal-table tbody td.col-name > .group-name {
    grid-area: name;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 var(--space-1);
  }
  .meal-table tfoot td.col-name {
    grid-area: name;
    min-width: 0;
  }
  /* Don't double-indent group-children on mobile — col-name has no
     box, and the prefix column already separates emoji from text. */
  .meal-table tbody tr.group-child td.col-name { padding-left: 0; }
  .meal-table td.col-del { grid-area: menu; }
  .meal-table td.col-srv { grid-area: srv; }
  .meal-table tbody td.col-num:not(.col-p):not(.col-f):not(.col-c),
  .meal-table tfoot td.col-num:not(.col-p):not(.col-f):not(.col-c) { grid-area: cal; }
  .meal-table td.col-p { grid-area: p; }
  .meal-table td.col-f { grid-area: f; }
  .meal-table td.col-c { grid-area: c; }

  /* Drop the carb-tint backgrounds on group rows — they look heavy
     in the stacked mobile layout. */
  .meal-table tbody tr.meal-group-header,
  .meal-table tbody tr.meal-group-header:hover { background: transparent; }
  .meal-table tbody tr.group-child td { background: transparent; }

  .meal-table-wrap { overflow-x: visible; }
}

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

/* Quick-log modals (dose / measurement) — single big input, enter to
   submit. Borrows the exercise-modal shell so visual rhythm matches the
   surrounding surface. */
.quick-log-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: var(--space-5);
  width: 92%;
  max-width: 380px;
}
.quick-log-modal h3 {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}
.quick-log-unit-hint {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  font-weight: var(--font-weight-regular);
}
.quick-log-date {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-weight: var(--font-weight-regular);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}
.quick-log-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.quick-log-input {
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-l);
  text-align: center;
  border: 1px solid var(--border-strong);
  background: var(--bg);
  color: var(--text);
}
.quick-log-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-ring);
}
</style>
