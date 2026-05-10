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
  // MRU list of recently-used exercise IDs from /api/exercises/recent.
  // Used by the log-page typeahead to surface habitual activities
  // above the alphabetical search results.
  const recentIds = ref([]);

  const enabled = computed(() => exercises.value.filter((e) => e.enabled));

  // Recent exercise rows in MRU order, hydrated from `recentIds`. Skips
  // ids the catalog no longer contains (e.g. a deleted custom row).
  const recents = computed(() => {
    const byId = new Map(exercises.value.map((e) => [String(e._id), e]));
    const out = [];
    for (const id of recentIds.value) {
      const ex = byId.get(id);
      if (ex) out.push(ex);
    }
    return out;
  });

  async function fetchAll() {
    const data = await api.get('/api/exercises');
    exercises.value = data.exercises;
    loaded.value = true;
  }

  async function fetchRecents(limit = 8) {
    const data = await api.get(`/api/exercises/recent?limit=${limit}`);
    recentIds.value = data.exerciseIds || [];
  }

  // Substring match on name; case-insensitive. Cheap because the full
  // catalog (~85 system + custom) lives in memory.
  function search(query, { limit = 25 } = {}) {
    const q = String(query || '').trim().toLowerCase();
    const recentSet = new Set(recentIds.value);
    const candidates = exercises.value;
    if (!q) {
      // Empty query: surface everything except recents (which the page
      // renders separately) so the dropdown doesn't double up on them.
      return candidates
        .filter((e) => !recentSet.has(String(e._id)))
        .slice(0, limit);
    }
    const scored = [];
    for (const e of candidates) {
      const name = String(e.name || '').toLowerCase();
      if (!name.includes(q)) continue;
      // Prefix matches outrank substring matches; alphabetical
      // tiebreaker keeps results stable across keystrokes.
      const prefix = name.startsWith(q) ? 0 : 1;
      scored.push({ e, prefix, name });
    }
    scored.sort((a, b) => a.prefix - b.prefix || a.name.localeCompare(b.name));
    return scored.slice(0, limit).map((s) => s.e);
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

  return {
    exercises, enabled, loaded, recentIds, recents,
    fetchAll, fetchRecents, search,
    create, update, remove, getById,
  };
}, {
  persist: { pick: ['exercises'] },
});
