import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';

// Exercise catalog. Mirrors the Compounds store — system-seeded entries
// land on first GET; users can add custom entries via create() and
// edit/disable via update(). Disabled rows hide from pickers but
// historical ExerciseLog entries are unaffected.
export const useExercisesStore = defineStore('exercises', () => {
  const exercises = ref([]);
  const loaded = ref(false);

  const enabled = computed(() => exercises.value.filter((e) => e.enabled));

  async function fetchAll() {
    const data = await api.get('/api/exercises');
    exercises.value = data.exercises;
    loaded.value = true;
  }

  async function create(payload) {
    const data = await api.post('/api/exercises', payload);
    exercises.value.push(data.exercise);
    return data.exercise;
  }

  async function update(id, patch) {
    const data = await api.patch(`/api/exercises/${id}`, patch);
    const idx = exercises.value.findIndex((e) => e._id === id);
    if (idx !== -1) exercises.value[idx] = data.exercise;
    return data.exercise;
  }

  async function remove(id) {
    await api.del(`/api/exercises/${id}`);
    // System rows go to enabled=false rather than truly delete; refetch
    // to pick up that state change without local logic duplication.
    await fetchAll();
  }

  function getById(id) {
    return exercises.value.find((e) => e._id === id) || null;
  }

  return { exercises, enabled, loaded, fetchAll, create, update, remove, getById };
}, {
  persist: { pick: ['exercises'] },
});
