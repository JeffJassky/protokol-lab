import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { createHead } from '@unhead/vue/client';
import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';
import App from './App.vue';
import router from './router/index.js';
import { registerServiceWorker } from './pwa/register.js';
import { installTrackerAutoPageView } from './composables/useTracker.js';
import { initSentry } from './sentry.js';
import { isNativePlatform } from './api/auth-token.js';
import { hydrateAppVersion } from './api/app-version.js';
import { makePersistedStateStorage } from './persistedstate.js';
import './style.css';

const app = createApp(App);
// Sentry must init before mount so the Vue error handler is registered
// before any component renders. No-op when VITE_SENTRY_DSN is unset.
initSentry(app, router);
const pinia = createPinia();
// Plugin handles re-hydration on store mount and write-through on mutation.
// Storage is platform-aware (localStorage on web, @capacitor/preferences on
// native). Stores opt in via `defineStore(id, fn, { persist: {...} })`.
pinia.use(piniaPluginPersistedstate({
  storage: makePersistedStateStorage(),
}));
app.use(pinia);
app.use(router);
app.use(createHead());
app.use(FloatingVue);
app.mount('#app');

// Funnel telemetry — auto page_view on every nav. Manual events
// (cta_click, etc.) are emitted via useTracker() at the call-site.
installTrackerAutoPageView(router);

registerServiceWorker(router);

// Read the native app version into our cache so api/index.js can attach
// X-App-Version on every request (drives the minAppVersion gate). Cheap
// no-op on web.
hydrateAppVersion();

// Initialize native social-login providers on app boot. Web uses GIS via
// GoogleSignInButton.vue and ignores this branch. The dynamic import keeps
// the plugin out of the web bundle entirely.
if (isNativePlatform()) {
  (async () => {
    try {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.initialize({
        google: {
          // The web client_id is required for Android and the iOS
          // server-auth-code path; iOS in-app login uses the iOS client_id
          // when present. Both come from the same Google Cloud project.
          webClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          iOSClientId: import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID || import.meta.env.VITE_GOOGLE_CLIENT_ID,
          iOSServerClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          mode: 'online',
        },
      });
    } catch (err) {
      // Initialization failures here aren't user-blocking — the sign-in
      // button surfaces its own error if the user tries to use it.
      // eslint-disable-next-line no-console
      console.warn('[social-login] init failed', err);
    }
  })();
}
