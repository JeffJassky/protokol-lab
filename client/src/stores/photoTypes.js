import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';

// Mirrors the metrics store shape. Per-user photo categorization library
// (front, side, back + customs). Components like PhotoCaptureCard +
// PhotoTimelineCard read `enabled` to decide which slots to render.
export const usePhotoTypesStore = defineStore('photoTypes', () => {
  const photoTypes = ref([]);
  const loading = ref(false);

  async function fetchPhotoTypes() {
    loading.value = true;
    try {
      const data = await api.get('/api/photo-types');
      photoTypes.value = data.photoTypes;
    } finally {
      loading.value = false;
    }
  }

  async function createPhotoType({ name }) {
    const data = await api.post('/api/photo-types', { name });
    photoTypes.value = [...photoTypes.value, data.photoType];
    return data.photoType;
  }

  async function updatePhotoType(id, patch) {
    const data = await api.patch(`/api/photo-types/${id}`, patch);
    photoTypes.value = photoTypes.value.map((t) => (t._id === id ? data.photoType : t));
    return data.photoType;
  }

  async function deletePhotoType(id) {
    await api.del(`/api/photo-types/${id}`);
    photoTypes.value = photoTypes.value.filter((t) => t._id !== id);
  }

  async function reorder(ids) {
    await api.put('/api/photo-types/reorder', { ids });
    const order = new Map(ids.map((id, i) => [id, i]));
    photoTypes.value = [...photoTypes.value].sort(
      (a, b) => (order.get(a._id) ?? a.order) - (order.get(b._id) ?? b.order),
    );
  }

  const enabled = computed(() =>
    photoTypes.value
      .filter((t) => t.enabled)
      .sort((a, b) => a.order - b.order),
  );

  function findByKey(key) {
    return photoTypes.value.find((t) => t.key === key) || null;
  }

  return {
    photoTypes,
    loading,
    enabled,
    fetchPhotoTypes,
    createPhotoType,
    updatePhotoType,
    deletePhotoType,
    reorder,
    findByKey,
  };
});
