import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

export const useMealsStore = defineStore('meals', () => {
  const meals = ref([]);
  const loading = ref(false);

  function totalsFor(meal) {
    let cal = 0;
    let p = 0;
    let f = 0;
    let c = 0;
    for (const item of meal.items || []) {
      const food = item.foodItemId;
      if (!food || typeof food !== 'object') continue;
      const ps = food.perServing || {};
      cal += (ps.calories || 0) * item.servingCount;
      p += (ps.protein || 0) * item.servingCount;
      f += (ps.fat || 0) * item.servingCount;
      c += (ps.carbs || 0) * item.servingCount;
    }
    return {
      cal: Math.round(cal),
      p: Math.round(p),
      f: Math.round(f),
      c: Math.round(c),
    };
  }

  async function fetchMeals() {
    loading.value = true;
    try {
      const data = await api.get('/api/meals');
      meals.value = data.meals;
    } finally {
      loading.value = false;
    }
  }

  async function createMeal(name, items = [], emoji = '') {
    const data = await api.post('/api/meals', { name, items, emoji });
    meals.value = [data.meal, ...meals.value];
    return data.meal;
  }

  async function updateMeal(id, payload) {
    const data = await api.put(`/api/meals/${id}`, payload);
    replaceMeal(data.meal);
    return data.meal;
  }

  async function deleteMeal(id) {
    await api.del(`/api/meals/${id}`);
    meals.value = meals.value.filter((m) => m._id !== id);
  }

  async function addItem(mealId, foodItemId, servingCount = 1) {
    const data = await api.post(`/api/meals/${mealId}/items`, { foodItemId, servingCount });
    replaceMeal(data.meal);
    return data.meal;
  }

  async function updateItem(mealId, itemId, servingCount) {
    const data = await api.put(`/api/meals/${mealId}/items/${itemId}`, { servingCount });
    replaceMeal(data.meal);
    return data.meal;
  }

  async function removeItem(mealId, itemId) {
    const data = await api.del(`/api/meals/${mealId}/items/${itemId}`);
    replaceMeal(data.meal);
    return data.meal;
  }

  async function logMeal(mealId, date, mealType) {
    const data = await api.post(`/api/meals/${mealId}/log`, { date, mealType });
    return data.entries;
  }

  function replaceMeal(updated) {
    const idx = meals.value.findIndex((m) => m._id === updated._id);
    if (idx >= 0) meals.value.splice(idx, 1, updated);
    else meals.value = [updated, ...meals.value];
  }

  return {
    meals,
    loading,
    totalsFor,
    fetchMeals,
    createMeal,
    updateMeal,
    deleteMeal,
    addItem,
    updateItem,
    removeItem,
    logMeal,
  };
});
