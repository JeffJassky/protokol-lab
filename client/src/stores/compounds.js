import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';

export const useCompoundsStore = defineStore('compounds', () => {
  const compounds = ref([]);
  const loaded = ref(false);

  const enabled = computed(() => compounds.value.filter((c) => c.enabled));

  async function fetchAll() {
    const data = await api.get('/api/compounds');
    compounds.value = data.compounds;
    loaded.value = true;
  }

  async function create({ name, halfLifeDays, intervalDays, doseUnit, color }) {
    const data = await api.post('/api/compounds', { name, halfLifeDays, intervalDays, doseUnit, color });
    compounds.value.push(data.compound);
    return data.compound;
  }

  async function update(id, patch) {
    const data = await api.patch(`/api/compounds/${id}`, patch);
    const idx = compounds.value.findIndex((c) => c._id === id);
    if (idx !== -1) compounds.value[idx] = data.compound;
    return data.compound;
  }

  async function remove(id) {
    await api.del(`/api/compounds/${id}`);
    compounds.value = compounds.value.filter((c) => c._id !== id);
  }

  function getById(id) {
    return compounds.value.find((c) => c._id === id) || null;
  }

  return { compounds, enabled, loaded, fetchAll, create, update, remove, getById };
});
