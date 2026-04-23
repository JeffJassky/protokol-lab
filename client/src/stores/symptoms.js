import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

export const useSymptomsStore = defineStore('symptoms', () => {
  const symptoms = ref([]);
  const loggedDates = ref(new Set());
  // Range logs: array of { symptomId, date, severity } for chart plotting.
  const rangeLogs = ref([]);
  // logs map keyed by `${symptomId}` -> { _id, severity } for the currently
  // loaded date. Reset whenever the date changes.
  const logsBySymptom = ref({});
  const currentDate = ref(null);
  const loading = ref(false);

  async function fetchSymptoms() {
    const data = await api.get('/api/symptoms');
    symptoms.value = data.symptoms;
  }

  async function createSymptom(name) {
    const data = await api.post('/api/symptoms', { name });
    symptoms.value = [...symptoms.value, data.symptom];
    return data.symptom;
  }

  async function deleteSymptom(id) {
    await api.del(`/api/symptoms/${id}`);
    symptoms.value = symptoms.value.filter((s) => s._id !== id);
    delete logsBySymptom.value[id];
  }

  async function fetchLogsForDate(date) {
    loading.value = true;
    try {
      const data = await api.get(`/api/symptoms/logs?date=${date}`);
      currentDate.value = date;
      const map = {};
      for (const log of data.logs) {
        map[log.symptomId] = { _id: log._id, severity: log.severity };
      }
      logsBySymptom.value = map;
    } finally {
      loading.value = false;
    }
  }

  async function setSeverity(symptomId, severity) {
    const date = currentDate.value;
    if (!date) return;
    const payload = { symptomId, date, severity };
    if (severity == null) {
      await api.put('/api/symptoms/logs', payload);
      const next = { ...logsBySymptom.value };
      delete next[symptomId];
      logsBySymptom.value = next;
      return;
    }
    const data = await api.put('/api/symptoms/logs', payload);
    logsBySymptom.value = {
      ...logsBySymptom.value,
      [symptomId]: { _id: data.log._id, severity: data.log.severity },
    };
  }

  // Returns the stored severity (0-10) or null if no entry exists for this
  // symptom on the current date. 0 is a valid logged value ("explicitly none")
  // and must be distinct from "no entry".
  async function fetchRangeLogs(from, to) {
    const params = new URLSearchParams({ from, to });
    const data = await api.get(`/api/symptoms/logs/range?${params}`);
    rangeLogs.value = data.logs;
  }

  async function fetchLoggedDates(from, to) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const data = await api.get(`/api/symptoms/logged-dates?${params}`);
    loggedDates.value = new Set(data.dates);
  }

  function getSeverity(symptomId) {
    const log = logsBySymptom.value[symptomId];
    return log ? log.severity : null;
  }

  return {
    symptoms,
    logsBySymptom,
    loggedDates,
    rangeLogs,
    currentDate,
    loading,
    fetchSymptoms,
    createSymptom,
    deleteSymptom,
    fetchLogsForDate,
    fetchRangeLogs,
    fetchLoggedDates,
    setSeverity,
    getSeverity,
  };
});
