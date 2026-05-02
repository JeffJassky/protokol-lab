import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../api/index.js';
import { setAuthToken, clearAuthToken, hydrateAuthToken } from '../api/auth-token.js';

// On native, the JWT comes back in the JSON body when api/index.js opts in
// with `X-Auth-Mode: bearer`. Capture and persist it; web ignores `data.token`
// entirely (server doesn't include it for cookie-mode requests).
function captureToken(data) {
  if (data?.token) setAuthToken(data.token);
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null);
  const checked = ref(false);
  // Server-driven floor for the native binary. When set and the device's
  // app version is below it, the UI shows a force-update modal pointing
  // to the App Store / Play Store. Web ignores this — no version concept.
  const minAppVersion = ref(null);

  async function fetchMe() {
    // Hydrate the persisted Bearer token on native before the first request
    // so the auto-login path actually carries credentials. Awaiting is safe
    // on web (resolves immediately) and required on native (Preferences is
    // async).
    await hydrateAuthToken();
    try {
      // Race the fetch against an 8s timeout so a hung network (CORS
      // misconfig, server cold-start) doesn't block the whole app boot.
      // checked still resolves either way; the user lands on /login or
      // the persisted shell instead of a stuck splash.
      const data = await Promise.race([
        api.get('/api/auth/me'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('fetchMe timeout')), 8000)),
      ]);
      user.value = data.user;
      minAppVersion.value = data.minAppVersion || null;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[auth] fetchMe failed', err?.message || err);
      user.value = null;
    } finally {
      checked.value = true;
    }
  }

  async function login(email, password) {
    const data = await api.post('/api/auth/login', { email, password });
    captureToken(data);
    user.value = data.user;
  }

  async function register(email, password) {
    const data = await api.post('/api/auth/register', { email, password });
    captureToken(data);
    user.value = data.user;
  }

  async function loginWithGoogle(credential) {
    const data = await api.post('/api/auth/google', { credential });
    captureToken(data);
    user.value = data.user;
  }

  // Apple Sign-In (native iOS for now). Payload shape mirrors what
  // AppleSignInButton emits: { identityToken, fullName }. Server route
  // verifies the JWT, looks up by appleId or auto-links by email.
  async function loginWithApple(payload) {
    const data = await api.post('/api/auth/apple', payload);
    captureToken(data);
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
    clearAuthToken();
    user.value = null;
  }

  // Permanent account deletion. Server cascades S3, Stripe customer (which
  // auto-cancels active subs), and every user-owned collection. After
  // success, clear local state so any in-flight requests don't keep
  // sending the now-revoked token.
  async function deleteAccount({ password, confirm } = {}) {
    const body = {};
    if (password) body.password = password;
    if (confirm) body.confirm = true;
    await api.del('/api/auth/me', body);
    clearAuthToken();
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
    user, checked, minAppVersion,
    fetchMe, login, register, loginWithGoogle, loginWithApple, requestPasswordReset, resetPassword, logout,
    deleteAccount,
    setOnboardingStep, completeOnboarding,
  };
}, {
  // Persist the user doc so a cold native cold-start renders the authed
  // shell while `fetchMe()` revalidates in the background. `checked` is
  // omitted on purpose — it's a per-session flag, not state worth carrying
  // across launches. The Bearer token lives in `auth-token.js` via
  // @capacitor/preferences (kept separate so api/index.js can read it
  // synchronously without touching Pinia).
  persist: { pick: ['user'] },
});
