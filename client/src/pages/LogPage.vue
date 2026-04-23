<script setup>
import { ref, watch, onMounted, computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFoodLogStore } from '../stores/foodlog.js';
import { useMealsStore } from '../stores/meals.js';
import { useSymptomsStore } from '../stores/symptoms.js';
import { useNotesStore } from '../stores/notes.js';
import { useWeightStore } from '../stores/weight.js';
import { useSettingsStore } from '../stores/settings.js';
import DateSelector from '../components/DateSelector.vue';
import DailySummary from '../components/DailySummary.vue';
import DatePickerModal from '../components/DatePickerModal.vue';
import FoodItemEditModal from '../components/FoodItemEditModal.vue';
import WeeklyBudgetStrip from '../components/WeeklyBudgetStrip.vue';

const route = useRoute();
const router = useRouter();
const foodlogStore = useFoodLogStore();
const mealsStore = useMealsStore();
const symptomsStore = useSymptomsStore();
const notesStore = useNotesStore();
const weightStore = useWeightStore();
const settingsStore = useSettingsStore();

const date = ref(route.query.date || new Date().toISOString().slice(0, 10));
const editingId = ref(null);
const editServings = ref(1);

// Flyout state for the food entry "..." menus.
const openMenuId = ref(null);
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
  closeMenu();
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
const newDoseMg = ref('');
const savingDose = ref(false);

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
    notesStore.fetchForDate(d),
  ]);
  noteDraft.value = notesStore.text;
}

onMounted(async () => {
  await Promise.all([
    loadAllForDate(date.value),
    mealsStore.fetchMeals(),
    symptomsStore.fetchSymptoms(),
    weightStore.fetchEntries(),
    weightStore.fetchDoses(),
    weightStore.fetchWaistEntries(),
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
  const s = entry.servingCount;
  return {
    cal: Math.round((food.caloriesPer || 0) * s),
    p: Math.round((food.proteinPer || 0) * s),
    f: Math.round((food.fatPer || 0) * s),
    c: Math.round((food.carbsPer || 0) * s),
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
  await foodlogStore.updateEntry(id, { servingCount: Number(editServings.value) });
  editingId.value = null;
}

function cancelEdit() {
  editingId.value = null;
}

function addFood(mealType) {
  router.push(`/food/search?meal=${mealType}&date=${date.value}`);
}

// ---- "..." flyout -------------------------------------------------------

function openMenu(entryId, event) {
  event.stopPropagation();
  openMenuId.value = openMenuId.value === entryId ? null : entryId;
  openSubmenu.value = null;
}

function closeMenu() {
  openMenuId.value = null;
  openSubmenu.value = null;
}

async function handleDelete(entry) {
  closeMenu();
  await foodlogStore.deleteEntry(entry._id);
}

async function handleDeleteGroup(mealType, group) {
  closeMenu();
  if (!confirm(`Remove all ${group.entries.length} items from "${group.mealName}"?`)) return;
  for (const entry of group.entries) {
    // eslint-disable-next-line no-await-in-loop
    await foodlogStore.deleteEntry(entry._id);
  }
}

async function addEntryToMeal(entry, mealId) {
  closeMenu();
  const foodItemId = entry.foodItemId?._id;
  if (!foodItemId) return;
  await mealsStore.addItem(mealId, foodItemId, entry.servingCount);
}

async function addEntryToNewMeal(entry) {
  const name = prompt('New meal name:');
  if (!name || !name.trim()) return;
  closeMenu();
  const foodItemId = entry.foodItemId?._id;
  if (!foodItemId) return;
  const meal = await mealsStore.createMeal(name.trim());
  await mealsStore.addItem(meal._id, foodItemId, entry.servingCount);
}

// ---- Copy / Move flows --------------------------------------------------

function openPicker({ mode, ids, title }) {
  closeMenu();
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

// ---- Weight + waist + dose forms ----------------------------------------

const todaysWeight = computed(() =>
  weightStore.entries.find((e) => String(e.date).slice(0, 10) === date.value),
);
const todaysWaist = computed(() =>
  weightStore.waistEntries.find((e) => String(e.date).slice(0, 10) === date.value),
);
const todaysDose = computed(() =>
  weightStore.doses.find((d) => String(d.date).slice(0, 10) === date.value),
);

const newWaist = ref('');
const savingWaist = ref(false);

// "Next dose" label based on most recent dose + interval from settings.
const nextDoseLabel = computed(() => {
  const interval = settingsStore.settings?.doseIntervalDays || 5;
  const doses = weightStore.doses;
  if (!doses.length) return null;

  // doses are sorted newest-first from the store/backend.
  const lastDoseDate = String(doses[0].date).slice(0, 10);
  const [y, m, d] = lastDoseDate.split('-').map(Number);
  const last = new Date(y, m - 1, d); // local midnight
  const next = new Date(last);
  next.setDate(next.getDate() + interval);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = next.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  const dayName = next.toLocaleDateString(undefined, { weekday: 'long' });

  if (diffDays < 0) return { text: `Overdue by ${-diffDays} day${-diffDays === 1 ? '' : 's'}`, urgent: true };
  if (diffDays === 0) return { text: `Today — log now`, urgent: true };
  if (diffDays === 1) return { text: `Tomorrow (${dayName})`, urgent: true };
  if (diffDays <= 3) return { text: `In ${diffDays} days (${dayName})`, urgent: false };
  return { text: `In ${diffDays} days (${dayName})`, urgent: false };
});

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

async function handleAddDose() {
  if (!newDoseMg.value) return;
  savingDose.value = true;
  try {
    await weightStore.addDose(Number(newDoseMg.value), date.value);
    newDoseMg.value = '';
  } finally {
    savingDose.value = false;
  }
}

async function handleDeleteWeight() {
  if (!todaysWeight.value) return;
  await weightStore.deleteWeight(todaysWeight.value._id);
}
async function handleAddWaist() {
  if (!newWaist.value) return;
  savingWaist.value = true;
  try {
    await weightStore.addWaist(Number(newWaist.value), date.value);
    newWaist.value = '';
  } finally {
    savingWaist.value = false;
  }
}
async function handleDeleteWaist() {
  if (!todaysWaist.value) return;
  await weightStore.deleteWaist(todaysWaist.value._id);
}
async function handleDeleteDose() {
  if (!todaysDose.value) return;
  await weightStore.deleteDose(todaysDose.value._id);
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
  <div class="log-page" @click="closeMenu">
    <h2>Log</h2>
    <DateSelector v-model="date" />

    <!-- =========================================================== -->
    <!-- TOP ROW: Nutrition (half) + stacked Weight/Dose (half)       -->
    <!-- =========================================================== -->
    <div class="top-row">
      <div v-if="foodlogStore.summary" class="meal-card nutrition-card top-col">
        <div class="meal-header"><h3>Nutrition</h3></div>
        <DailySummary :summary="foodlogStore.summary" />
      </div>

      <div class="top-col stacked-col">
        <div class="meal-card compact">
          <div class="body-metrics">
            <div class="metric-col">
              <div class="metric-label">Weight</div>
              <form v-if="!todaysWeight" class="quick-form" @submit.prevent="handleAddWeight">
                <input type="number" v-model.number="newWeight" step="0.1" placeholder="lbs" required />
                <button class="btn-primary" type="submit" :disabled="savingWeight">Log</button>
              </form>
              <div v-else class="logged-row">
                <span class="logged-value">{{ todaysWeight.weightLbs }} lbs</span>
                <button class="delete-btn" @click="handleDeleteWeight">x</button>
              </div>
            </div>
            <div class="metric-col">
              <div class="metric-label">Waist</div>
              <form v-if="!todaysWaist" class="quick-form" @submit.prevent="handleAddWaist">
                <input type="number" v-model.number="newWaist" step="0.25" placeholder="in" required />
                <button class="btn-primary" type="submit" :disabled="savingWaist">Log</button>
              </form>
              <div v-else class="logged-row">
                <span class="logged-value">{{ todaysWaist.waistInches }}"</span>
                <button class="delete-btn" @click="handleDeleteWaist">x</button>
              </div>
            </div>
          </div>
        </div>

        <div class="meal-card compact">
          <div class="meal-header">
            <h3>Retatrutide</h3>
            <span class="card-sub">dose</span>
          </div>
          <form v-if="!todaysDose" class="quick-form" @submit.prevent="handleAddDose">
            <input type="number" v-model.number="newDoseMg" step="0.25" placeholder="mg" required />
            <button class="btn-primary" type="submit" :disabled="savingDose">
              {{ savingDose ? 'Saving...' : 'Log' }}
            </button>
          </form>
          <div v-else class="logged-row">
            <span class="logged-value">{{ todaysDose.doseMg }} mg</span>
            <button class="delete-btn" @click="handleDeleteDose">x</button>
          </div>
          <div v-if="nextDoseLabel" class="next-dose" :class="{ urgent: nextDoseLabel.urgent }">
            <span class="next-dose-label">Next dose:</span> {{ nextDoseLabel.text }}
          </div>
        </div>
      </div>
    </div>

    <!-- =========================================================== -->
    <!-- ROLLING 7-DAY BUDGET                                         -->
    <!-- =========================================================== -->
    <div class="weekly-wrap">
      <WeeklyBudgetStrip />
    </div>

    <!-- =========================================================== -->
    <!-- FOOD LOG                                                     -->
    <!-- =========================================================== -->
    <div class="meal-card food-card">
      <div class="meal-header"><h3>Food</h3></div>
      <div v-for="meal in orderedMealTypes" :key="meal.key" class="meal-section">
        <div class="meal-section-header">
          <h4>{{ meal.label }}</h4>
          <button class="add-btn" @click="addFood(meal.key)">+</button>
        </div>
        <table v-if="foodlogStore.entries[meal.key].length" class="meal-table">
        <thead>
          <tr>
            <th class="col-check"></th>
            <th class="col-name">Item</th>
            <th class="col-srv">Servings</th>
            <th class="col-num sortable" @click="toggleSort('cal')">Cal{{ sortIndicator('cal') }}</th>
            <th class="col-num col-p sortable" @click="toggleSort('p')">Pro{{ sortIndicator('p') }}</th>
            <th class="col-num col-f sortable" @click="toggleSort('f')">Fat{{ sortIndicator('f') }}</th>
            <th class="col-num col-c sortable" @click="toggleSort('c')">Carbs{{ sortIndicator('c') }}</th>
            <th class="col-del"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, rowIdx) in groupedBySlot[meal.key]" :key="row.type === 'group' ? `g-${row.mealId}-${rowIdx}` : `e-${row.entry._id}`">
            <tr v-if="row.type === 'entry'" class="entry-row" :class="{ unconsumed: row.entry.consumed === false }">
              <td class="col-check">
                <input
                  type="checkbox"
                  :checked="row.entry.consumed !== false"
                  @click.stop
                  @change="foodlogStore.toggleConsumed(row.entry._id, $event.target.checked)"
                />
              </td>
              <td class="col-name">
                <span v-if="row.entry.foodItemId?.emoji" class="entry-emoji">{{ row.entry.foodItemId.emoji }}</span>
                <span class="entry-name">{{ row.entry.foodItemId?.name }}</span>
              </td>
              <td class="col-srv">
                <template v-if="editingId === row.entry._id">
                  <input
                    type="number"
                    v-model.number="editServings"
                    min="0.25"
                    step="0.25"
                    class="edit-input"
                    @click.stop
                    @keyup.enter="saveEdit(row.entry._id)"
                    @keyup.escape="cancelEdit"
                  />
                  <button class="save-btn" @click.stop="saveEdit(row.entry._id)">✓</button>
                </template>
                <span v-else class="servings" @click.stop="startEdit(row.entry)">
                  {{ row.entry.servingCount }}
                </span>
              </td>
              <td class="col-num">{{ entryNutrition(row.entry).cal }}</td>
              <td class="col-num col-p">{{ entryNutrition(row.entry).p }}</td>
              <td class="col-num col-f">{{ entryNutrition(row.entry).f }}</td>
              <td class="col-num col-c">{{ entryNutrition(row.entry).c }}</td>
              <td class="col-del">
                <div class="menu-anchor">
                  <button class="menu-btn" @click.stop="openMenu(row.entry._id, $event)">⋯</button>
                  <div v-if="openMenuId === row.entry._id" class="menu" @click.stop>
                    <button class="menu-item" @click="openEditModal(row.entry)">Edit item</button>
                    <button class="menu-item" @click="handleDelete(row.entry)">Delete</button>
                    <button class="menu-item" @click="startCopyEntry(row.entry)">Copy to...</button>
                    <button class="menu-item" @click="startMoveEntry(row.entry)">Move to...</button>
                    <button class="menu-item with-submenu" @click="openSubmenu = openSubmenu === 'addToMeal' ? null : 'addToMeal'">
                      Add to meal ▸
                    </button>
                    <div v-if="openSubmenu === 'addToMeal'" class="submenu">
                      <button class="menu-item" @click="addEntryToNewMeal(row.entry)">+ New meal...</button>
                      <button
                        v-for="m in mealsStore.meals"
                        :key="m._id"
                        class="menu-item"
                        @click="addEntryToMeal(row.entry, m._id)"
                      >
                        {{ m.name }}
                      </button>
                      <p v-if="!mealsStore.meals.length" class="menu-empty">No meals yet</p>
                    </div>
                  </div>
                </div>
              </td>
            </tr>

            <template v-else>
              <tr class="meal-group-header" @click="toggleCollapsed(meal.key, row.mealId)">
                <td class="col-check"></td>
                <td class="col-name">
                  <span class="caret">{{ isCollapsed(meal.key, row.mealId) ? '▸' : '▾' }}</span>
                  <span v-if="row.mealEmoji" class="entry-emoji">{{ row.mealEmoji }}</span>
                  <span class="group-name">{{ row.mealName }}</span>
                  <span class="group-count">{{ row.entries.length }} item{{ row.entries.length === 1 ? '' : 's' }}</span>
                </td>
                <td class="col-srv"></td>
                <td class="col-num">{{ sumNutrition(row.entries).cal }}</td>
                <td class="col-num col-p">{{ sumNutrition(row.entries).p }}</td>
                <td class="col-num col-f">{{ sumNutrition(row.entries).f }}</td>
                <td class="col-num col-c">{{ sumNutrition(row.entries).c }}</td>
                <td class="col-del">
                  <div class="menu-anchor">
                    <button class="menu-btn" @click.stop="openMenu(`g:${meal.key}:${row.mealId}`, $event)">⋯</button>
                    <div v-if="openMenuId === `g:${meal.key}:${row.mealId}`" class="menu" @click.stop>
                      <button class="menu-item" @click="handleDeleteGroup(meal.key, row)">Delete group</button>
                      <button class="menu-item" @click="startCopyGroup(row)">Copy to...</button>
                      <button class="menu-item" @click="startMoveGroup(row)">Move to...</button>
                    </div>
                  </div>
                </td>
              </tr>
              <template v-if="!isCollapsed(meal.key, row.mealId)">
                <tr v-for="child in sortEntries(row.entries)" :key="`gc-${child._id}`" class="entry-row group-child" :class="{ unconsumed: child.consumed === false }">
                  <td class="col-check">
                    <input
                      type="checkbox"
                      :checked="child.consumed !== false"
                      @click.stop
                      @change="foodlogStore.toggleConsumed(child._id, $event.target.checked)"
                    />
                  </td>
                  <td class="col-name">
                    <span class="entry-name indent">
                      <span v-if="child.foodItemId?.emoji" class="entry-emoji">{{ child.foodItemId.emoji }}</span>
                      {{ child.foodItemId?.name }}
                    </span>
                  </td>
                  <td class="col-srv">
                    <template v-if="editingId === child._id">
                      <input
                        type="number"
                        v-model.number="editServings"
                        min="0.25"
                        step="0.25"
                        class="edit-input"
                        @click.stop
                        @keyup.enter="saveEdit(child._id)"
                        @keyup.escape="cancelEdit"
                      />
                      <button class="save-btn" @click.stop="saveEdit(child._id)">✓</button>
                    </template>
                    <span v-else class="servings" @click.stop="startEdit(child)">
                      {{ child.servingCount }}
                    </span>
                  </td>
                  <td class="col-num">{{ entryNutrition(child).cal }}</td>
                  <td class="col-num col-p">{{ entryNutrition(child).p }}</td>
                  <td class="col-num col-f">{{ entryNutrition(child).f }}</td>
                  <td class="col-num col-c">{{ entryNutrition(child).c }}</td>
                  <td class="col-del">
                    <button class="delete-btn" @click.stop="foodlogStore.deleteEntry(child._id)">x</button>
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
            <td class="col-num">{{ sumNutrition(foodlogStore.entries[meal.key]).cal }}</td>
            <td class="col-num col-p">{{ sumNutrition(foodlogStore.entries[meal.key]).p }}</td>
            <td class="col-num col-f">{{ sumNutrition(foodlogStore.entries[meal.key]).f }}</td>
            <td class="col-num col-c">{{ sumNutrition(foodlogStore.entries[meal.key]).c }}</td>
            <td class="col-del"></td>
          </tr>
        </tfoot>
        </table>
        <p v-else class="empty">No items.</p>
      </div>
    </div>

    <!-- =========================================================== -->
    <!-- SYMPTOMS                                                     -->
    <!-- =========================================================== -->
    <div class="meal-card">
      <div class="meal-header">
        <h3>Symptoms</h3>
      </div>
      <p class="hint">Tap a dot to log severity (0 = none, 1-10 = mild → severe). Tap again to clear.</p>

      <div class="symptoms-list">
        <div v-for="symptom in symptomsStore.symptoms" :key="symptom._id" class="symptom-row">
          <div class="symptom-header">
            <span class="symptom-name">{{ symptom.name }}</span>
            <button v-if="!symptom.isDefault" class="delete-btn" @click="handleDeleteSymptom(symptom)">x</button>
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
            >0</button>
            <button
              v-for="i in 10"
              :key="i"
              type="button"
              class="dot"
              :class="{
                active: isDotActive(symptomsStore.getSeverity(symptom._id), i),
                copyable: isDotCopyable(symptomsStore.getSeverity(symptom._id), i),
              }"
              :style="isDotActive(symptomsStore.getSeverity(symptom._id), i) ? { background: dotColors[i - 1], borderColor: dotColors[i - 1] } : {}"
              :title="`${i}/10`"
              @click="setSeverity(symptom._id, i)"
            >{{ i }}</button>
          </div>
        </div>
      </div>

      <div class="add-symptom">
        <button v-if="!addingSymptom" class="btn-secondary" @click="addingSymptom = true">+ Add custom symptom</button>
        <form v-else class="quick-form" @submit.prevent="handleAddSymptom">
          <input
            v-model="newSymptomName"
            type="text"
            placeholder="Symptom name"
            autofocus
            @keyup.escape="addingSymptom = false; newSymptomName = ''"
          />
          <button class="btn-primary" type="submit">Add</button>
          <button class="btn-text" type="button" @click="addingSymptom = false; newSymptomName = ''">Cancel</button>
        </form>
        <p v-if="symptomError" class="error">{{ symptomError }}</p>
      </div>
    </div>

    <!-- =========================================================== -->
    <!-- DAY NOTE                                                     -->
    <!-- =========================================================== -->
    <div class="meal-card">
      <div class="meal-header">
        <h3>Note</h3>
        <span v-if="notesStore.saving" class="card-sub">saving...</span>
      </div>
      <textarea
        v-model="noteDraft"
        class="note-textarea"
        rows="4"
        placeholder="Add context for the day..."
        @input="onNoteInput"
        @blur="onNoteBlur"
      ></textarea>
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
.log-page { max-width: 640px; }

/* The nutrition card uses the same shell as a meal card but its inner padding
   gets a touch more breathing room since the macro bars need vertical space. */
.nutrition-card { padding-bottom: 1.25rem; }
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
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.top-row .top-col { min-width: 0; }
.top-row .meal-card { margin-bottom: 0; }
.stacked-col {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.meal-card.compact { padding: 0.85rem 1rem; }
.meal-card.compact .meal-header { margin-bottom: 0.4rem; }
.body-metrics {
  display: flex;
  gap: 1rem;
}
.metric-col { flex: 1; min-width: 0; }
.metric-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 0.35rem;
}

.card-sub {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  font-weight: 500;
}
.next-dose {
  margin-top: 0.5rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--border);
  font-size: 0.78rem;
  color: var(--text-secondary);
}
.next-dose.urgent { color: var(--warning); font-weight: var(--font-weight-bold); }
.next-dose-label { font-weight: 500; color: var(--text-secondary); }
@media (max-width: 540px) {
  .top-row { grid-template-columns: 1fr; }
}

.weekly-wrap { margin-bottom: 0.75rem; }

.meal-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1rem 1.25rem;
  margin-bottom: 0.75rem;
}
.meal-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.meal-header h3 {
  margin: 0;
  flex: 1;
  font-size: 0.95rem;
}

/* Food card with stacked meal sections (Breakfast / Lunch / Dinner / Snack). */
.food-card .meal-section + .meal-section {
  border-top: 1px solid var(--border);
  margin-top: 0.85rem;
  padding-top: 0.85rem;
}
.meal-section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.meal-section-header h4 {
  margin: 0;
  flex: 1;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.add-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.add-btn:hover { background: var(--primary-hover); }

.meal-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.83rem;
  font-variant-numeric: tabular-nums;
}
.meal-table th {
  font-weight: 500;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-secondary);
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid var(--border);
}
.meal-table td {
  padding: 0.4rem 0.4rem;
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.meal-table tbody tr:last-child td { border-bottom: none; }
.meal-table tfoot td {
  border-top: 1px solid var(--border);
  border-bottom: none;
  padding-top: 0.5rem;
  font-weight: 600;
}

.col-name {
  text-align: left;
  width: auto;
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.entry-name { font-weight: 500; color: var(--text); }
.entry-emoji { display: inline-block; margin-right: 0.3rem; font-size: 0.95rem; line-height: 1; }
.servings {
  cursor: pointer;
  border-bottom: 1px dotted var(--text-secondary);
  padding: 0 0.15rem;
}
.edit-input {
  width: 48px;
  padding: 0.15rem 0.3rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.8rem;
  background: var(--bg);
  color: var(--text);
}
.edit-input:focus { outline: none; border-color: var(--primary); }
.save-btn {
  font-size: 0.7rem;
  padding: 0.1rem 0.35rem;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 0.2rem;
}
.delete-btn, .menu-btn {
  background: none;
  border: none;
  color: var(--text-disabled);
  cursor: pointer;
  font-size: var(--font-size-s);
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
}
.menu-btn { font-size: 1.1rem; line-height: 1; }
.delete-btn:hover { color: var(--danger); background: var(--danger-soft); }
.menu-btn:hover { color: var(--text); background: var(--bg); }

.menu-anchor { position: relative; display: inline-block; }
.menu {
  position: absolute;
  top: 100%;
  right: 0;
  min-width: 140px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-m);
  padding: 0.25rem;
  z-index: 100;
  margin-top: 0.25rem;
}
.menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 0.4rem 0.7rem;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text);
  font-size: 0.82rem;
  white-space: nowrap;
}
.menu-item:hover { background: var(--bg); }
.menu-item.with-submenu { position: relative; }
.submenu {
  border-top: 1px solid var(--border);
  margin-top: 0.25rem;
  padding-top: 0.25rem;
  max-height: 240px;
  overflow-y: auto;
}
.menu-empty {
  font-size: 0.75rem;
  color: var(--text-secondary);
  padding: 0.4rem 0.7rem;
  margin: 0;
}

.meal-group-header {
  background: var(--tint-carbs-softer);
  cursor: pointer;
}
.meal-group-header:hover { background: var(--tint-carbs-soft); }
.meal-group-header td { font-weight: 600; }
.meal-group-header .caret {
  display: inline-block;
  width: 0.9rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
}
.meal-group-header .group-name { color: var(--text); }
.meal-group-header .group-count {
  font-weight: 400;
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-left: 0.4rem;
}
.entry-name.indent { padding-left: 1rem; }
.group-child td { background: var(--tint-carbs-softest); }

.empty {
  color: var(--text-disabled);
  font-size: var(--font-size-s);
  padding: 0.25rem 0;
  margin: 0;
}

/* Quick weight/dose form */
.quick-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.quick-form input {
  flex: 1;
  min-width: 0;
  max-width: 80px;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.9rem;
}
.quick-form input:focus { outline: none; border-color: var(--primary); }
.btn-primary {
  padding: 0.45rem 1rem;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
}
.btn-primary:hover { background: var(--primary-hover); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-secondary {
  padding: 0.45rem 1rem;
  background: var(--bg);
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-secondary:hover { color: var(--text); }
.btn-text {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.82rem;
  padding: 0.4rem 0.5rem;
}
.btn-text:hover { color: var(--text); }

.logged-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.logged-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

/* Symptoms */
.hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin: 0 0 0.75rem;
}
.symptoms-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.symptom-row {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
}
.symptom-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.4rem;
}
.symptom-name {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text);
}
.dots {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s, box-shadow 0.1s;
  font-variant-numeric: tabular-nums;
  user-select: none;
  -webkit-user-select: none;
}
.dot.copyable {
  user-select: text;
  -webkit-user-select: text;
}
.dot:hover { transform: scale(1.1); }
.dot.active { color: #fff; border-color: transparent; font-weight: var(--font-weight-bold); }
.dot.active:hover { box-shadow: var(--shadow-s); }
.dot.dot-zero { margin-right: 0.2rem; }

.add-symptom { margin-top: 0.25rem; }

.note-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.9rem;
  font-family: inherit;
  resize: vertical;
  line-height: 1.4;
}
.note-textarea:focus { outline: none; border-color: var(--primary); }
.error { color: var(--danger); font-size: 0.78rem; margin: 0.4rem 0 0; }
</style>
