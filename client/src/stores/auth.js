import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const checked = ref(false);

  async function fetchMe() {
    try {
      const data = await api.get('/api/auth/me');
      user.value = data.user;
    } catch {
      user.value = null;
    } finally {
      checked.value = true;
    }
  }

  async function login(email, password) {
    const data = await api.post('/api/auth/login', { email, password });
    user.value = data.user;
  }

  async function logout() {
    await api.post('/api/auth/logout');
    user.value = null;
  }

  return { user, checked, fetchMe, login, logout };
});
