import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

export const useNotesStore = defineStore('notes', () => {
  const text = ref('');
  const currentDate = ref(null);
  const saving = ref(false);
  const rangeNotes = ref([]);

  async function fetchRange(from, to) {
    const params = new URLSearchParams({ from, to });
    const data = await api.get(`/api/notes/range?${params}`);
    rangeNotes.value = data.notes;
  }

  async function fetchForDate(date) {
    currentDate.value = date;
    const data = await api.get(`/api/notes?date=${date}`);
    text.value = data.note?.text || '';
  }

  async function save(date, value) {
    saving.value = true;
    try {
      const data = await api.put('/api/notes', { date, text: value });
      if (currentDate.value === date) {
        text.value = data.note?.text || '';
      }
    } finally {
      saving.value = false;
    }
  }

  return { text, currentDate, saving, rangeNotes, fetchForDate, fetchRange, save };
});
