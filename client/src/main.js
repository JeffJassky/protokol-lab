import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createHead } from '@unhead/vue/client';
import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';
import App from './App.vue';
import router from './router/index.js';
import { registerServiceWorker } from './pwa/register.js';
import { installTrackerAutoPageView } from './composables/useTracker.js';
import { initSentry } from './sentry.js';
import './style.css';

const app = createApp(App);
// Sentry must init before mount so the Vue error handler is registered
// before any component renders. No-op when VITE_SENTRY_DSN is unset.
initSentry(app, router);
app.use(createPinia());
app.use(router);
app.use(createHead());
app.use(FloatingVue);
app.mount('#app');

// Funnel telemetry — auto page_view on every nav. Manual events
// (cta_click, etc.) are emitted via useTracker() at the call-site.
installTrackerAutoPageView(router);

registerServiceWorker(router);
