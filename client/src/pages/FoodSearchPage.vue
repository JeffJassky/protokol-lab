<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFoodStore } from '../stores/food.js';
import { api } from '../api/index.js';
import FoodItemRow from '../components/FoodItemRow.vue';

const route = useRoute();
const router = useRouter();
const foodStore = useFoodStore();

const meal = ref(route.query.meal || 'breakfast');
const date = ref(route.query.date || new Date().toISOString().slice(0, 10));
const tab = ref('search');
const query = ref('');
const selectedFood = ref(null);
const servingCount = ref(1);
const adding = ref(false);

let searchTimeout = null;

watch(query, (val) => {
  clearTimeout(searchTimeout);
  if (!val.trim()) {
    foodStore.searchResults = [];
    return;
  }
  searchTimeout = setTimeout(() => foodStore.search(val), 300);
});

onMounted(() => {
  foodStore.fetchRecents();
  foodStore.fetchFavorites();
});

function selectFood(food) {
  selectedFood.value = food;
  servingCount.value = food.lastServingCount || food.defaultServingCount || 1;
}

function cancelSelect() {
  selectedFood.value = null;
}

async function confirmAdd() {
  adding.value = true;
  const food = selectedFood.value;

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
    body.offBarcode = food.offBarcode;
    body.name = food.name;
    body.brand = food.brand;
    body.servingSize = food.servingSize;
    body.servingGrams = food.servingGrams;
    body.caloriesPer = food.caloriesPer;
    body.proteinPer = food.proteinPer;
    body.fatPer = food.fatPer;
    body.carbsPer = food.carbsPer;
  }

  await api.post('/api/foodlog', body);
  adding.value = false;
  router.push(`/food?date=${date.value}`);
}

function getFoodData(item) {
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
</script>

<template>
  <div class="food-search-page">
    <div class="header">
      <button class="back-btn" @click="router.push(`/food?date=${date}`)">Back</button>
      <h2>Add Food</h2>
      <select v-model="meal" class="meal-select">
        <option value="breakfast">Breakfast</option>
        <option value="lunch">Lunch</option>
        <option value="dinner">Dinner</option>
        <option value="snack">Snack</option>
      </select>
    </div>

    <!-- Confirm panel -->
    <div v-if="selectedFood" class="confirm-card">
      <h3>{{ selectedFood.name }}</h3>
      <p class="confirm-meta">
        {{ selectedFood.caloriesPer }} cal per serving
        ({{ selectedFood.servingSize || `${selectedFood.servingGrams}g` }})
      </p>
      <div class="macro-row">
        <span>P {{ selectedFood.proteinPer }}g</span>
        <span>F {{ selectedFood.fatPer }}g</span>
        <span>C {{ selectedFood.carbsPer }}g</span>
      </div>
      <div class="confirm-form">
        <label>Servings</label>
        <input type="number" v-model.number="servingCount" min="0.25" step="0.25" />
        <span class="total-cal">= {{ Math.round(selectedFood.caloriesPer * servingCount) }} cal</span>
      </div>
      <div class="confirm-actions">
        <button class="btn-secondary" @click="cancelSelect">Cancel</button>
        <button class="btn-primary" :disabled="adding" @click="confirmAdd">
          {{ adding ? 'Adding...' : `Add to ${meal}` }}
        </button>
      </div>
    </div>

    <!-- Tabs + content -->
    <div v-else>
      <div class="tabs">
        <button :class="{ active: tab === 'search' }" @click="tab = 'search'">Search</button>
        <button :class="{ active: tab === 'recents' }" @click="tab = 'recents'">Recents</button>
        <button :class="{ active: tab === 'favorites' }" @click="tab = 'favorites'">Favorites</button>
      </div>

      <div v-if="tab === 'search'">
        <input
          class="search-input"
          type="text"
          v-model="query"
          placeholder="Search foods..."
          autofocus
        />
        <p v-if="foodStore.searching" class="status">Searching...</p>
        <div class="results-card">
          <FoodItemRow
            v-for="(food, i) in foodStore.searchResults"
            :key="food.offBarcode || food._id || i"
            :food="food"
            :show-source="true"
            @select="selectFood"
          />
        </div>
        <p v-if="!foodStore.searching && query && !foodStore.searchResults.length" class="status">No results found.</p>
      </div>

      <div v-if="tab === 'recents'">
        <div class="results-card">
          <FoodItemRow
            v-for="item in foodStore.recents"
            :key="item._id"
            :food="getFoodData(item)"
            @select="selectFood(getFoodData(item))"
          />
        </div>
        <p v-if="!foodStore.recents.length" class="status">No recent foods yet.</p>
      </div>

      <div v-if="tab === 'favorites'">
        <div class="results-card">
          <FoodItemRow
            v-for="item in foodStore.favorites"
            :key="item._id"
            :food="getFoodData(item)"
            @select="selectFood(getFoodData(item))"
          >
            <template #actions>
              <button class="fav-btn active" @click.stop="foodStore.removeFavorite(item._id)">&#9733;</button>
            </template>
          </FoodItemRow>
        </div>
        <p v-if="!foodStore.favorites.length" class="status">No favorites yet.</p>
      </div>
    </div>
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
  border-radius: 6px;
  padding: 0.3rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
.back-btn:hover { background: var(--bg); }
.meal-select {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 0.85rem;
}

.tabs {
  display: flex;
  margin-bottom: 1rem;
  border-bottom: 2px solid var(--border);
}
.tabs button {
  flex: 1;
  padding: 0.6rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text-secondary);
  transition: all 0.15s;
}
.tabs button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 500;
}

.search-input {
  width: 100%;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
  background: var(--surface);
  color: var(--text);
}
.search-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}

.results-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.results-card .food-row { margin: 0; border-radius: 0; }

.status {
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-align: center;
  padding: 1.5rem 0;
}

.confirm-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
}
.confirm-card h3 { margin: 0 0 0.25rem; font-size: 1.1rem; }
.confirm-meta { color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.5rem; }
.macro-row {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}
.confirm-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
}
.confirm-form label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
}
.confirm-form input {
  width: 80px;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.95rem;
  background: var(--bg);
  color: var(--text);
}
.confirm-form input:focus {
  outline: none;
  border-color: var(--primary);
}
.total-cal { font-weight: 600; color: var(--text); font-size: 0.95rem; }

.confirm-actions { display: flex; gap: 0.5rem; }
.btn-secondary {
  padding: 0.5rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.9rem;
}
.btn-primary {
  padding: 0.5rem 1.25rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
}
.btn-primary:hover { background: var(--primary-hover); }
.btn-primary:disabled { opacity: 0.6; }

.fav-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #d1d5db;
  padding: 0.2rem;
}
.fav-btn.active { color: var(--warning); }
</style>
