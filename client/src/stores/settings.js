import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(null);
  const loaded = ref(false);

  async function fetchSettings() {
    const data = await api.get('/api/settings');
    settings.value = data.settings;
    loaded.value = true;
  }

  async function updateSettings(payload) {
    const data = await api.put('/api/settings', payload);
    settings.value = data.settings;
  }

  // Partial update for just the notification-related fields — avoids sending
  // the whole profile when the user only touched a reminder toggle.
  async function updateNotifications(patch) {
    const data = await api.patch('/api/settings/notifications', patch);
    settings.value = data.settings;
  }

  return { settings, loaded, fetchSettings, updateSettings, updateNotifications };
});
