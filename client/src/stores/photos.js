import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';
import { prepPhoto } from '../utils/imagePrep.js';

export const ANGLES = ['front', 'side', 'back', 'other'];

export const usePhotosStore = defineStore('photos', () => {
  const entries = ref([]);
  const uploading = ref(false);

  // Newest first per angle so "latest for this date + angle" is entries[0].
  const byDate = computed(() => {
    const map = new Map();
    for (const p of entries.value) {
      if (!map.has(p.date)) map.set(p.date, []);
      map.get(p.date).push(p);
    }
    return map;
  });

  function forDate(date) {
    return byDate.value.get(date) || [];
  }

  function forDateAngle(date, angle) {
    return forDate(date).find((p) => p.angle === angle) || null;
  }

  async function fetchRange(from, to) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    const data = await api.get(`/api/photos${qs ? `?${qs}` : ''}`);
    entries.value = data.entries;
  }

  async function fetchAll() {
    await fetchRange();
  }

  // Count of photos uploaded this calendar month (UTC). Used for pre-flight
  // plan-cap checks; server still enforces. Accurate only when entries
  // covering the current month are loaded into the store.
  const currentMonthCount = computed(() => {
    const now = new Date();
    const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    return entries.value.reduce((n, p) => {
      const t = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
      return Number.isFinite(t) && t >= start && t < end ? n + 1 : n;
    }, 0);
  });

  async function uploadPhoto(file, { date, angle = 'other' }) {
    uploading.value = true;
    try {
      const prepped = await prepPhoto(file);
      const { uploadUrl, thumbUploadUrl, s3Key, thumbKey } = await api.post(
        '/api/photos/upload-url',
        { date, angle, contentType: prepped.contentType, ext: prepped.ext },
      );

      // Direct-to-Spaces PUTs. ContentType must match what we presigned with.
      const [fullRes, thumbRes] = await Promise.all([
        fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': prepped.contentType },
          body: prepped.fullBlob,
        }),
        fetch(thumbUploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/webp' },
          body: prepped.thumbBlob,
        }),
      ]);
      if (!fullRes.ok || !thumbRes.ok) {
        throw new Error(`Upload failed (${fullRes.status}/${thumbRes.status})`);
      }

      const { entry } = await api.post('/api/photos', {
        date,
        angle,
        s3Key,
        thumbKey,
        contentType: prepped.contentType,
        width: prepped.width,
        height: prepped.height,
        bytes: prepped.bytes,
        takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
      });
      entries.value = [entry, ...entries.value];
      return entry;
    } finally {
      uploading.value = false;
    }
  }

  async function deletePhoto(id) {
    await api.del(`/api/photos/${id}`);
    entries.value = entries.value.filter((p) => p._id !== id);
  }

  return {
    entries,
    uploading,
    byDate,
    currentMonthCount,
    forDate,
    forDateAngle,
    fetchRange,
    fetchAll,
    uploadPhoto,
    deletePhoto,
  };
});
