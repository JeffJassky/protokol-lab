<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFoodLogStore } from '../stores/foodlog.js';
import DateSelector from '../components/DateSelector.vue';
import DailySummary from '../components/DailySummary.vue';

const route = useRoute();
const router = useRouter();
const store = useFoodLogStore();

const date = ref(route.query.date || new Date().toISOString().slice(0, 10));
const editingId = ref(null);
const editServings = ref(1);

const mealTypes = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];

onMounted(() => store.loadDay(date.value));

watch(date, (val) => {
  store.loadDay(val);
  router.replace({ query: { date: val } });
});

function mealCalories(entries) {
  return entries.reduce((sum, e) => {
    const food = e.foodItemId;
    return sum + (food ? food.caloriesPer * e.servingCount : 0);
  }, 0);
}

function startEdit(entry) {
  editingId.value = entry._id;
  editServings.value = entry.servingCount;
}

async function saveEdit(id) {
  await store.updateEntry(id, { servingCount: Number(editServings.value) });
  editingId.value = null;
}

function cancelEdit() {
  editingId.value = null;
}

function addFood(mealType) {
  router.push(`/food/search?meal=${mealType}&date=${date.value}`);
}
</script>

<template>
  <div class="food-log-page">
    <h2>Food Log</h2>
    <DateSelector v-model="date" />
    <DailySummary v-if="store.summary" :summary="store.summary" />

    <div v-for="meal in mealTypes" :key="meal.key" class="meal-card">
      <div class="meal-header">
        <h3>{{ meal.label }}</h3>
        <span class="meal-cals">{{ Math.round(mealCalories(store.entries[meal.key])) }} cal</span>
        <button class="add-btn" @click="addFood(meal.key)">+</button>
      </div>
      <div v-if="store.entries[meal.key].length">
        <div v-for="entry in store.entries[meal.key]" :key="entry._id" class="entry-row">
          <div class="entry-info">
            <span class="entry-name">{{ entry.foodItemId?.name }}</span>
            <span class="entry-meta">
              <template v-if="editingId === entry._id">
                <input
                  type="number"
                  v-model.number="editServings"
                  min="0.25"
                  step="0.25"
                  class="edit-input"
                  @keyup.enter="saveEdit(entry._id)"
                  @keyup.escape="cancelEdit"
                />
                <button class="save-btn" @click="saveEdit(entry._id)">Save</button>
              </template>
              <template v-else>
                <span class="servings" @click="startEdit(entry)">
                  {{ entry.servingCount }} serving{{ entry.servingCount !== 1 ? 's' : '' }}
                </span>
              </template>
            </span>
          </div>
          <span class="entry-cals">{{ Math.round((entry.foodItemId?.caloriesPer || 0) * entry.servingCount) }} cal</span>
          <button class="delete-btn" @click="store.deleteEntry(entry._id)">x</button>
        </div>
      </div>
      <p v-else class="empty">No items.</p>
    </div>
  </div>
</template>

<style scoped>
.food-log-page { max-width: 640px; }

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
.meal-cals {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
}
.add-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  border: none;
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.add-btn:hover { background: var(--primary-hover); }

.entry-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.45rem 0;
  border-top: 1px solid var(--border);
}
.entry-info { flex: 1; min-width: 0; }
.entry-name {
  display: block;
  font-size: 0.88rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}
.entry-meta { font-size: 0.78rem; color: var(--text-secondary); }
.servings {
  cursor: pointer;
  border-bottom: 1px dotted var(--text-secondary);
}
.edit-input {
  width: 60px;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.85rem;
  background: var(--bg);
  color: var(--text);
}
.edit-input:focus { outline: none; border-color: var(--primary); }
.save-btn {
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  margin-left: 0.25rem;
}
.entry-cals {
  font-weight: 600;
  font-size: 0.83rem;
  white-space: nowrap;
  color: var(--text);
}
.delete-btn {
  background: none;
  border: none;
  color: #d1d5db;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
}
.delete-btn:hover { color: var(--danger); background: rgba(220, 38, 38, 0.06); }
.empty {
  color: #d1d5db;
  font-size: 0.85rem;
  padding: 0.25rem 0;
  margin: 0;
}
</style>
