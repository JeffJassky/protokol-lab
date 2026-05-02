<script setup>
import { ref, defineAsyncComponent, onMounted, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFoodStore } from '../stores/food.js';
import { useMealsStore } from '../stores/meals.js';
import { api } from '../api/index.js';
import FoodItemRow from '../components/FoodItemRow.vue';
import EmojiPickerButton from '../components/EmojiPickerButton.vue';
// BarcodeScannerModal pulls @zxing/browser + @zxing/library on web (~150 kB).
// Lazy-load so the chunk only downloads on first scan-button tap. On native
// the modal swaps to ML Kit which uses the OS scanner and adds nothing.
const BarcodeScannerModal = defineAsyncComponent(() => import('../components/BarcodeScannerModal.vue'));
import UpgradeBadge from '../components/UpgradeBadge.vue';
import { usePlanLimits } from '../composables/usePlanLimits.js';
import { useUpgradeModalStore } from '../stores/upgradeModal.js';
import { useSettingsStore } from '../stores/settings.js';
import { useProfileFieldsGate } from '../composables/useProfileFieldsGate.js';
import { localYmd } from '../utils/date.js';

const route = useRoute();
const router = useRouter();
const foodStore = useFoodStore();
const mealsStore = useMealsStore();
const planLimits = usePlanLimits();
const upgradeModal = useUpgradeModalStore();
const settingsStore = useSettingsStore();
const profileGate = useProfileFieldsGate();

// Saved meals are plan-capped (Free=5, paid=∞). The store always has the
// authoritative count so we can pre-flight gate the create surfaces.
const savedMealCount = computed(() => mealsStore.meals.length);
const savedMealCap = computed(() => planLimits.storageCap('savedMeals'));
const mealsAtCap = computed(
  () => !planLimits.canAddStorage('savedMeals', savedMealCount.value),
);
const mealsUpgradeTier = computed(() => {
  const target = planLimits.planRequiredFor({ storageKey: 'savedMeals' });
  return target?.id || null;
});

// "addToMeal" mode: the user is appending a food to a specific meal template
// instead of logging it to the diary. Triggered from the Meals tab on this
// same page (via "+ Add food to this meal") or from the Food Log "..." flyout.
const addToMealId = ref(route.query.addToMeal || null);
const targetMeal = computed(() =>
  addToMealId.value ? mealsStore.meals.find((m) => m._id === addToMealId.value) : null,
);

// Favorite lookup by foodItemId. Search results come from multiple sources
// (local foods, OpenFoodFacts, meals) so matching by foodItem id is the one
// key that's present for the rows where "favorite" is meaningful.
const favoriteIds = computed(() => {
  const s = new Set();
  for (const f of foodStore.favorites) {
    const id = f.foodItemId?._id || f.foodItemId;
    if (id) s.add(String(id));
  }
  return s;
});
function isFavoriteFood(food) {
  const id = food._id || food.foodItemId?._id;
  return id ? favoriteIds.value.has(String(id)) : false;
}

const meal = ref(route.query.meal || 'breakfast');
const date = ref(route.query.date || localYmd());
const validTabs = new Set(['search', 'meals']);
const initialTab = validTabs.has(route.query.tab) ? route.query.tab : 'search';
const tab = ref(initialTab);
const query = ref('');
const selectedFood = ref(null);
const servingCount = ref(1);
const adding = ref(false);
const scannerOpen = ref(false);
const scanError = ref('');

// ---- Meals tab management state -----------------------------------------
const expandedMealId = ref(null);
const creatingMeal = ref(false);
const newMealName = ref('');
const newMealEmoji = ref('');
const editingNameId = ref(null);
const editName = ref('');

let searchTimeout = null;

watch(query, (val) => {
  clearTimeout(searchTimeout);
  if (!val.trim()) {
    foodStore.searchResults = [];
    return;
  }
  searchTimeout = setTimeout(() => foodStore.search(val), 500);
});

onMounted(async () => {
  foodStore.fetchRecents();
  foodStore.fetchFavorites();
  // Need the meals list for "addToMeal" target name + for selecting meal results.
  await mealsStore.fetchMeals();
});

// Ensure a FoodItem exists server-side for an OFF result before we can add it
// to a meal (meals reference foodItemId; OFF items only have a barcode until
// first used). We reuse the diary add flow with servingCount 0.0001 would be
// weird — instead we call a lightweight upsert by posting a placeholder diary
// entry then deleting it. Simpler: add a food item directly if there's no
// existing helper. For MVP we require OFF items to already have a FoodItem —
// use the "local" results or recents/favorites. If an OFF-sourced food gets
// selected in addToMeal mode, we hit /api/foodlog which does the upsert (by
// barcode), then immediately delete the log entry, keeping the FoodItem.
async function ensureFoodItemId(food) {
  if (food._id && food.source === 'local') return food._id;
  if (food.source === 'local' && food.foodItemId?._id) return food.foodItemId._id;

  // OFF item — round-trip through /api/foodlog's upsert-by-barcode path to
  // materialize a FoodItem, then delete the throwaway log entry. Clunky but
  // avoids adding a second upsert endpoint.
  const today = localYmd();
  const body = {
    date: today,
    mealType: 'snack',
    servingCount: 1,
    usdaFdcId: food.usdaFdcId,
    offBarcode: food.offBarcode,
    name: food.name,
    brand: food.brand,
    servingSize: food.servingSize,
    servingAmount: food.servingAmount,
    servingUnit: food.servingUnit,
    servingKnown: food.servingKnown,
    perServing: food.perServing || {},
    nutrientSource: food.nutrientSource,
    nutrientCoverage: food.nutrientCoverage,
  };
  const { entry } = await api.post('/api/foodlog', body);
  await api.del(`/api/foodlog/${entry._id}`);
  return entry.foodItemId?._id || entry.foodItemId;
}

async function handleScanned(code) {
  scannerOpen.value = false;
  scanError.value = '';
  try {
    const { result } = await api.get(`/api/food/barcode/${encodeURIComponent(code)}`);
    selectFood(result);
  } catch (err) {
    scanError.value = `No match for ${code}`;
  }
}

function selectFood(food) {
  selectedFood.value = food;
  servingCount.value = food.lastServingCount || food.defaultServingCount || 1;
}

function cancelSelect() {
  selectedFood.value = null;
}

// Meals can be selected directly from the results list (no confirm panel) —
// clicking logs all items to the current diary date+mealType. Bypasses
// selectFood because there's no per-serving config.
async function selectResult(food) {
  if (food.source === 'meal') {
    if (addToMealId.value) return; // ignore meal-in-meal nesting
    adding.value = true;
    try {
      await mealsStore.logMeal(food._id, date.value, meal.value);
      router.push(`/log?date=${date.value}`);
    } finally {
      adding.value = false;
    }
    return;
  }
  selectFood(food);
}

async function confirmAdd() {
  adding.value = true;
  try {
    const food = selectedFood.value;

    if (addToMealId.value) {
      // Add to meal template instead of diary. Stay in addToMeal mode after
      // so the user can add multiple foods in a row without re-navigating.
      const foodItemId = await ensureFoodItemId(food);
      await mealsStore.addItem(addToMealId.value, foodItemId, Number(servingCount.value));
      selectedFood.value = null;
      query.value = '';
      foodStore.searchResults = [];
      return;
    }

    const body = {
      date: date.value,
      mealType: meal.value,
      servingCount: Number(servingCount.value),
    };

    if (food._id && food.source === 'local') {
      body.foodItemId = food._id;
    } else if (food.source === 'local' && food.foodItemId?._id) {
      body.foodItemId = food.foodItemId._id;
    } else {
      body.usdaFdcId = food.usdaFdcId;
      body.offBarcode = food.offBarcode;
      body.name = food.name;
      body.brand = food.brand;
      body.servingSize = food.servingSize;
      body.servingAmount = food.servingAmount;
      body.servingUnit = food.servingUnit;
      body.servingKnown = food.servingKnown;
      body.perServing = food.perServing || {};
      body.nutrientSource = food.nutrientSource;
      body.nutrientCoverage = food.nutrientCoverage;
    }

    // Just-in-time profile gate (PRD §9): TDEE math needs body composition.
    // Skipped if the user already filled these in (returns immediately) or
    // hits Skip on the modal — the entry still logs either way.
    if (!settingsStore.loaded) {
      try { await settingsStore.fetchSettings(); } catch (_) { /* not fatal */ }
    }
    await profileGate.ensure(
      ['sex', 'age', 'heightInches', 'currentWeightLbs'],
      settingsStore.settings,
    );

    await api.post('/api/foodlog', body);
    router.push(`/log?date=${date.value}`);
  } finally {
    adding.value = false;
  }
}

function getFoodData(item) {
  // Recents API now returns either a food entry (kind: 'food', foodItemId: ...)
  // or a meal entry (kind: 'meal', meal: {...}). Favorites still use the older
  // populated-foodItemId shape without a `kind`.
  if (item.kind === 'meal' && item.meal) return item.meal;
  if (item.foodItemId && typeof item.foodItemId === 'object') {
    return {
      ...item.foodItemId,
      source: 'local',
      lastServingCount: item.lastServingCount,
      defaultServingCount: item.defaultServingCount,
    };
  }
  return item;
}

// ---- Meals tab actions --------------------------------------------------

function toggleExpandMeal(id) {
  expandedMealId.value = expandedMealId.value === id ? null : id;
}

async function handleCreateMeal() {
  if (!newMealName.value.trim()) return;

  // Pre-flight cap check. Server still enforces; this trims the round-trip
  // and gives a snappier upsell. Server 403 also surfaces the same modal.
  if (mealsAtCap.value) {
    upgradeModal.openForGate({
      limitKey: 'savedMeals',
      used: savedMealCount.value,
    });
    return;
  }

  const created = await mealsStore.createMeal(newMealName.value.trim(), [], newMealEmoji.value);
  newMealName.value = '';
  newMealEmoji.value = '';
  creatingMeal.value = false;
  expandedMealId.value = created._id;
}

function startCreateMeal() {
  if (mealsAtCap.value) {
    upgradeModal.openForGate({
      limitKey: 'savedMeals',
      used: savedMealCount.value,
    });
    return;
  }
  creatingMeal.value = true;
}

async function updateMealEmoji(m, emoji) {
  if ((m.emoji || '') === emoji) return;
  await mealsStore.updateMeal(m._id, { emoji });
}

function startRenameMeal(m) {
  editingNameId.value = m._id;
  editName.value = m.name;
}

async function saveRenameMeal(m) {
  if (editName.value.trim() && editName.value.trim() !== m.name) {
    await mealsStore.updateMeal(m._id, { name: editName.value.trim() });
  }
  editingNameId.value = null;
}

async function handleDeleteMeal(m) {
  if (!confirm(`Delete meal "${m.name}"? Past diary entries logged from this meal will keep their food but lose the grouping.`)) {
    return;
  }
  await mealsStore.deleteMeal(m._id);
  if (expandedMealId.value === m._id) expandedMealId.value = null;
}

async function updateItemServings(m, item, value) {
  const count = Number(value);
  if (Number.isNaN(count) || count <= 0) return;
  await mealsStore.updateItem(m._id, item._id, count);
}

async function removeMealItem(m, item) {
  await mealsStore.removeItem(m._id, item._id);
}

// Switch to the Search tab in addToMeal mode for a specific meal. Reuses the
// existing search UI but the confirmAdd flow appends to the meal's items
// instead of logging to the diary.
function startAddingFoodsToMeal(m) {
  addToMealId.value = m._id;
  tab.value = 'search';
  query.value = '';
  foodStore.searchResults = [];
  selectedFood.value = null;
}

// Done adding foods — leave addToMeal mode and return to the Meals tab.
function exitAddToMealMode() {
  addToMealId.value = null;
  selectedFood.value = null;
  query.value = '';
  foodStore.searchResults = [];
  tab.value = 'meals';
}

async function handleRowEmojiUpdate(food, emoji) {
  // Meal-source rows update the meal's own emoji; everything else is a FoodItem.
  if (food.source === 'meal') {
    await mealsStore.updateMeal(food._id, { emoji });
    food.emoji = emoji;
    return;
  }
  const foodItemId = food._id;
  if (!foodItemId) return;
  await foodStore.updateFoodEmoji(foodItemId, emoji);
}

async function logMealToToday(m) {
  if (!m.items.length) return;
  adding.value = true;
  try {
    await mealsStore.logMeal(m._id, date.value, meal.value);
    router.push(`/log?date=${date.value}`);
  } finally {
    adding.value = false;
  }
}
</script>

<template>
  <div class="food-search-page">
    <div class="header">
      <button class="back-btn" @click="addToMealId ? exitAddToMealMode() : router.push(`/log?date=${date}`)">
        {{ addToMealId ? 'Back to Meals' : 'Back' }}
      </button>
      <h2>{{ addToMealId ? 'Add Food to Meal' : 'Add Food' }}</h2>
      <select v-if="!addToMealId" v-model="meal" class="meal-select">
        <option value="breakfast">Breakfast</option>
        <option value="lunch">Lunch</option>
        <option value="dinner">Dinner</option>
        <option value="snack">Snack</option>
      </select>
    </div>

    <div v-if="addToMealId && targetMeal" class="target-meal-banner">
      <span>Adding to <strong>{{ targetMeal.name }}</strong></span>
      <button class="banner-done" @click="exitAddToMealMode">Done</button>
    </div>

    <!-- Confirm panel -->
    <div v-if="selectedFood" class="confirm-card">
      <h3>{{ selectedFood.name }}</h3>
      <p v-if="selectedFood.servingKnown === false" class="serving-warn-banner">
        ⚠ No serving size from source — set portion in food editor before logging.
      </p>
      <p class="confirm-meta">
        {{ Math.round(selectedFood.perServing?.calories || 0) }} kcal per serving
        ({{ selectedFood.servingSize || (selectedFood.servingAmount ? `${Math.round(selectedFood.servingAmount)}${selectedFood.servingUnit}` : '—') }})
      </p>
      <div class="macro-row">
        <span>P {{ Math.round(selectedFood.perServing?.protein || 0) }}g</span>
        <span>F {{ Math.round(selectedFood.perServing?.fat || 0) }}g</span>
        <span>C {{ Math.round(selectedFood.perServing?.carbs || 0) }}g</span>
      </div>
      <div class="confirm-form">
        <label>Servings</label>
        <input type="number" v-model.number="servingCount" min="0.25" step="0.25" />
        <span class="total-cal">= {{ Math.round((selectedFood.perServing?.calories || 0) * servingCount) }} kcal</span>
      </div>
      <div class="confirm-actions">
        <button class="btn-secondary" @click="cancelSelect">Cancel</button>
        <button class="btn-primary" :disabled="adding" @click="confirmAdd">
          <template v-if="adding">Adding...</template>
          <template v-else-if="addToMealId">Add to {{ targetMeal?.name || 'meal' }}</template>
          <template v-else>Add to {{ meal }}</template>
        </button>
      </div>
    </div>

    <!-- Tabs + content -->
    <div v-else>
      <div class="tabs">
        <button :class="{ active: tab === 'search' }" @click="tab = 'search'">Search</button>
        <button v-if="!addToMealId" :class="{ active: tab === 'meals' }" @click="tab = 'meals'">Meals</button>
      </div>

      <div v-if="tab === 'search'">
        <div class="search-row">
          <input
            class="search-input"
            type="text"
            v-model="query"
            placeholder="Search foods..."
            autofocus
          />
          <button
            type="button"
            class="scan-btn"
            title="Scan barcode"
            @click="scannerOpen = true; scanError = ''"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
              <path stroke="currentColor" stroke-width="2" stroke-linecap="round"
                d="M7 8v8M10 8v8M13 8v8M17 8v8" />
            </svg>
            <span class="scan-label">SCAN</span>
          </button>
        </div>
        <p v-if="scanError" class="status scan-error">{{ scanError }}</p>
        <template v-if="query.trim()">
          <p v-if="foodStore.searching" class="status">Searching...</p>
          <div class="results-card">
            <FoodItemRow
              v-for="(food, i) in foodStore.searchResults"
              :key="food.offBarcode || food._id || i"
              :food="food"
              :show-source="true"
              :is-favorite="isFavoriteFood(food)"
              :editable-emoji="food.source === 'local' || food.source === 'meal'"
              @select="selectResult"
              @update-emoji="handleRowEmojiUpdate"
            />
          </div>
          <p v-if="!foodStore.searching && !foodStore.searchResults.length" class="status">No results found.</p>
        </template>
        <template v-else>
          <h4 class="section-label">Recents</h4>
          <div class="results-card">
            <FoodItemRow
              v-for="item in foodStore.recents"
              :key="`${item.kind || 'fav'}-${item._id}`"
              :food="getFoodData(item)"
              :is-recent="true"
              :is-favorite="isFavoriteFood(getFoodData(item))"
              :editable-emoji="true"
              @select="selectResult(getFoodData(item))"
              @update-emoji="handleRowEmojiUpdate"
            />
          </div>
          <p v-if="!foodStore.recents.length" class="status">No recent foods yet.</p>
        </template>
      </div>

      <div v-if="tab === 'meals'">
        <div class="meals-toolbar">
          <button v-if="!creatingMeal" class="btn-secondary" @click="startCreateMeal">
            + New Meal
            <UpgradeBadge
              v-if="mealsAtCap && mealsUpgradeTier"
              :tier="mealsUpgradeTier"
            />
          </button>
          <form v-else class="create-meal-form" @submit.prevent="handleCreateMeal">
            <EmojiPickerButton v-model="newMealEmoji" size="sm" />
            <input
              v-model="newMealName"
              type="text"
              placeholder="Meal name"
              autofocus
              @keyup.escape="creatingMeal = false; newMealName = ''; newMealEmoji = ''"
            />
            <button class="btn-primary" type="submit">Create</button>
            <button class="btn-text" type="button" @click="creatingMeal = false; newMealName = ''; newMealEmoji = ''">Cancel</button>
          </form>
        </div>

        <p v-if="!mealsStore.meals.length" class="status">
          No meals yet. Create one with "+ New Meal", or use the "..." menu on a food log entry.
        </p>

        <div v-for="m in mealsStore.meals" :key="m._id" class="meal-card">
          <div class="meal-summary" @click="toggleExpandMeal(m._id)">
            <span class="caret">{{ expandedMealId === m._id ? '▾' : '▸' }}</span>
            <div @click.stop>
              <EmojiPickerButton
                :model-value="m.emoji || ''"
                size="lg"
                borderless
                @update:model-value="updateMealEmoji(m, $event)"
              />
            </div>
            <div class="meal-name-block">
              <template v-if="editingNameId === m._id">
                <input
                  v-model="editName"
                  class="rename-input"
                  @click.stop
                  @keyup.enter="saveRenameMeal(m)"
                  @keyup.escape="editingNameId = null"
                  @blur="saveRenameMeal(m)"
                  autofocus
                />
              </template>
              <template v-else>
                <span class="meal-name" @click.stop="startRenameMeal(m)">{{ m.name }}<span class="meal-item-count"> · {{ m.items.length }} item{{ m.items.length === 1 ? '' : 's' }}</span></span>
              </template>
            </div>
            <div class="meal-totals">
              <span class="cal">{{ mealsStore.totalsFor(m).cal }} kcal</span>
              <span class="macro macro-p">{{ mealsStore.totalsFor(m).p }}p</span>
              <span class="macro macro-f">{{ mealsStore.totalsFor(m).f }}f</span>
              <span class="macro macro-c">{{ mealsStore.totalsFor(m).c }}c</span>
            </div>
            <button class="meal-add-btn" type="button" aria-label="Log meal" :disabled="!m.items.length || adding" @click.stop="logMealToToday(m)">+</button>
          </div>

          <div v-if="expandedMealId === m._id" class="meal-items">
            <table v-if="m.items.length" class="items-table">
              <thead>
                <tr>
                  <th class="col-name">Item</th>
                  <th class="col-srv">Servings</th>
                  <th class="col-num">Kcal</th>
                  <th class="col-num col-p">P</th>
                  <th class="col-num col-f">F</th>
                  <th class="col-num col-c">C</th>
                  <th class="col-del"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in m.items" :key="item._id">
                  <td class="col-name">
                    <span v-if="item.foodItemId?.emoji" class="row-emoji-inline">{{ item.foodItemId.emoji }}</span>
                    {{ item.foodItemId?.name || '(deleted)' }}
                  </td>
                  <td class="col-srv">
                    <input
                      type="number"
                      min="0.25"
                      step="0.25"
                      :value="item.servingCount"
                      @change="updateItemServings(m, item, $event.target.value)"
                    />
                  </td>
                  <td class="col-num">{{ Math.round((item.foodItemId?.perServing?.calories || 0) * item.servingCount) }}</td>
                  <td class="col-num col-p">{{ Math.round((item.foodItemId?.perServing?.protein || 0) * item.servingCount) }}</td>
                  <td class="col-num col-f">{{ Math.round((item.foodItemId?.perServing?.fat || 0) * item.servingCount) }}</td>
                  <td class="col-num col-c">{{ Math.round((item.foodItemId?.perServing?.carbs || 0) * item.servingCount) }}</td>
                  <td class="col-del">
                    <button class="delete-btn" @click="removeMealItem(m, item)">x</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="empty-small">No items in this meal yet.</p>
            <div class="meal-actions">
              <button class="btn-secondary" @click="startAddingFoodsToMeal(m)">+ Add food</button>
              <button class="btn-delete-meal" type="button" @click="handleDeleteMeal(m)">Delete meal</button>
              <button class="btn-primary" :disabled="!m.items.length || adding" @click="logMealToToday(m)">
                Log to {{ meal }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <BarcodeScannerModal
      v-if="scannerOpen"
      @detected="handleScanned"
      @close="scannerOpen = false"
    />
  </div>
</template>

<style scoped>
.food-search-page { max-width: 640px; }

.header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.header h2 { flex: 1; margin: 0; }
.back-btn {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
}
.back-btn:hover { background: var(--bg); }
.meal-select {
  padding: var(--space-1) var(--space-2);
  background: var(--surface);
  font-size: var(--font-size-s);
}
.target-meal-banner {
  background: var(--tint-carbs-soft);
  border: 1px solid var(--tint-carbs-border);
  color: var(--text);
  padding: 0.6rem 0.85rem;
  border-radius: var(--radius-small);
  font-size: var(--font-size-s);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.target-meal-banner strong { color: var(--color-carbs); }
.banner-done {
  background: var(--color-carbs);
  border: none;
  color: var(--text-on-primary);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-small);
  cursor: pointer;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}
.banner-done:hover { background: var(--color-carbs-strong); }

/* Meals tab management UI */
.meals-toolbar {
  margin-bottom: var(--space-3);
}
.create-meal-form {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}
.create-meal-form input {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  font-size: var(--font-size-s);
}

.meal-card {
  background: var(--surface);
  border: 1px solid var(--border);
  margin-bottom: -1px;
}
.meal-card:first-of-type {
  border-top-left-radius: var(--radius-medium);
  border-top-right-radius: var(--radius-medium);
}
.meal-card:last-of-type {
  border-bottom-left-radius: var(--radius-medium);
  border-bottom-right-radius: var(--radius-medium);
  margin-bottom: 0;
}
.meal-summary {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
}
.meal-summary:hover { background: var(--bg); }
.caret {
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  width: 0.9rem;
}
.meal-name-block { flex: 1; min-width: 0; }
.meal-name {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
}
.meal-name:hover { color: var(--primary); }
.row-emoji-inline { display: inline-block; margin-right: var(--space-1); font-size: var(--font-size-m); line-height: 1; }
.rename-input {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  padding: var(--space-1) var(--space-1);
  border: 1px solid var(--primary);
  border-radius: var(--radius-small);
  background: var(--bg);
  color: var(--text);
  width: 100%;
  max-width: 280px;
}
.rename-input:focus { outline: none; }
.meal-item-count {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular, 400);
  color: var(--text-tertiary);
  margin-left: var(--space-1);
}
.meal-add-btn {
  flex-shrink: 0;
  border: none;
  background: transparent;
  padding: 0;
  color: var(--primary);
  font-size: 2rem;
  font-weight: var(--font-weight-bold);
  line-height: 1;
  cursor: pointer;
  transition: color var(--transition-fast);
}
.meal-add-btn:hover:not(:disabled) { color: var(--primary-strong, var(--primary)); }
.meal-add-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.meal-totals {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.meal-totals .cal { font-weight: var(--font-weight-bold); color: var(--text); }
.meal-totals .macro-p { color: var(--color-protein); }
.meal-totals .macro-f { color: var(--color-fat); }
.meal-totals .macro-c { color: var(--color-carbs); }
.delete-btn {
  background: none;
  border: none;
  color: var(--text-disabled);
  cursor: pointer;
  font-size: var(--font-size-s);
  padding: var(--space-1);
  border-radius: var(--radius-small);
}
.delete-btn:hover { color: var(--danger); background: var(--danger-soft); }

.meal-items {
  padding: var(--space-3) var(--space-3) var(--space-3);
  border-top: 1px solid var(--border);
  background: var(--bg);
  border-bottom-left-radius: var(--radius-medium);
  border-bottom-right-radius: var(--radius-medium);
}
.items-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-s);
  font-variant-numeric: tabular-nums;
  margin-bottom: var(--space-3);
}
.items-table th {
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-1);
  border-bottom: 1px solid var(--border);
}
.items-table td {
  padding: var(--space-1) var(--space-1);
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.items-table tbody tr:last-child td { border-bottom: none; }
.col-name {
  text-align: left;
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-srv { text-align: center; width: 4rem; }
.col-srv input {
  width: 3.2rem;
  padding: 0.15rem var(--space-1);
  background: var(--surface);
  font-size: var(--font-size-xs);
  text-align: center;
}
.col-num { text-align: right; width: 2.6rem; padding-left: 0.2rem; padding-right: 0.2rem; }
.col-del { width: 1.75rem; text-align: right; }
.items-table td.col-num:not(.col-p):not(.col-f):not(.col-c) { color: var(--text); font-weight: var(--font-weight-bold); }
.items-table td.col-p { color: var(--color-protein); }
.items-table td.col-f { color: var(--color-fat); }
.items-table td.col-c { color: var(--color-carbs); }
.items-table th.col-p { color: var(--color-protein); }
.items-table th.col-f { color: var(--color-fat); }
.items-table th.col-c { color: var(--color-carbs); }

.meal-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: space-between;
  align-items: center;
}
.btn-delete-meal {
  background: none;
  border: none;
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
}
.btn-delete-meal:hover { color: var(--danger); }
.empty-small { color: var(--text-secondary); font-size: var(--font-size-xs); padding: var(--space-1) 0; margin: 0; }

.tabs {
  display: flex;
  margin-bottom: var(--space-4);
  border-bottom: 2px solid var(--border);
}
.tabs button {
  flex: 1;
  padding: var(--space-2);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  transition: color var(--transition-base), border-color var(--transition-base);
}
.tabs button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: var(--font-weight-medium);
}

.section-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  margin: var(--space-1) 0 var(--space-1);
}
.search-row {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.search-input {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-m);
  background: var(--surface);
}
.scan-btn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: 0 var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  cursor: pointer;
  color: var(--text-secondary);
}
.scan-btn:hover { color: var(--primary); border-color: var(--primary); }
.scan-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--tracking-wide);
}
.scan-error { color: var(--danger, #d33); padding: var(--space-1) 0; }

.results-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
}
.results-card .food-row { margin: 0; border-radius: 0; }
.results-card > :first-child { border-top-left-radius: var(--radius-medium); border-top-right-radius: var(--radius-medium); }
.results-card > :last-child { border-bottom-left-radius: var(--radius-medium); border-bottom-right-radius: var(--radius-medium); }

.status {
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  text-align: center;
  padding: var(--space-6) 0;
}

.confirm-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-6);
}
.confirm-card h3 { margin: 0 0 var(--space-1); font-size: var(--font-size-l); }
.confirm-meta { color: var(--text-secondary); font-size: var(--font-size-s); margin-bottom: var(--space-2); }
.macro-row {
  display: flex;
  gap: var(--space-4);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-bottom: var(--space-4);
}
.confirm-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}
.confirm-form label {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}
.confirm-form input {
  width: 80px;
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-m);
}
.total-cal { font-weight: var(--font-weight-bold); color: var(--text); font-size: var(--font-size-m); }

.confirm-actions { display: flex; gap: var(--space-2); }

.fav-btn {
  background: none;
  border: none;
  font-size: var(--font-size-l);
  cursor: pointer;
  color: var(--text-disabled);
  padding: var(--space-1);
}
.fav-btn.active { color: var(--warning); }
</style>
