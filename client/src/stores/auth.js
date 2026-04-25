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

  async function register(email, password) {
    const data = await api.post('/api/auth/register', { email, password });
    user.value = data.user;
  }

  async function loginWithGoogle(credential) {
    const data = await api.post('/api/auth/google', { credential });
    user.value = data.user;
  }

  async function requestPasswordReset(email) {
    await api.post('/api/auth/forgot-password', { email });
  }

  async function resetPassword(token, password) {
    await api.post('/api/auth/reset-password', { token, password });
  }

  async function logout() {
    await api.post('/api/auth/logout');
    user.value = null;
  }

  async function setOnboardingStep(step) {
    const data = await api.post('/api/auth/onboarding/step', { step });
    user.value = data.user;
  }

  async function completeOnboarding() {
    const data = await api.post('/api/auth/onboarding/complete');
    user.value = data.user;
  }

  return {
    user, checked,
    fetchMe, login, register, loginWithGoogle, requestPasswordReset, resetPassword, logout,
    setOnboardingStep, completeOnboarding,
  };
});
