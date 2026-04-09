import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

export const useFoodStore = defineStore('food', () => {
  const searchResults = ref([]);
  const recents = ref([]);
  const favorites = ref([]);
  const searching = ref(false);

  async function search(query, page = 1) {
    if (!query.trim()) {
      searchResults.value = [];
      return;
    }
    searching.value = true;
    try {
      const data = await api.get(`/api/food/search?q=${encodeURIComponent(query)}&page=${page}`);
      searchResults.value = data.results;
    } finally {
      searching.value = false;
    }
  }

  async function fetchRecents() {
    const data = await api.get('/api/food/recents');
    recents.value = data.recents;
  }

  async function fetchFavorites() {
    const data = await api.get('/api/food/favorites');
    favorites.value = data.favorites;
  }

  async function addFavorite(foodItemId, defaultServingCount = 1, defaultMealType = null) {
    await api.post('/api/food/favorites', { foodItemId, defaultServingCount, defaultMealType });
    await fetchFavorites();
  }

  async function removeFavorite(id) {
    await api.del(`/api/food/favorites/${id}`);
    await fetchFavorites();
  }

  return { searchResults, recents, favorites, searching, search, fetchRecents, fetchFavorites, addFavorite, removeFavorite };
});
