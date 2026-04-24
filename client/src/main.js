import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createHead } from '@unhead/vue/client';
import FloatingVue from 'floating-vue';
import 'floating-vue/dist/style.css';
import App from './App.vue';
import router from './router/index.js';
import { registerServiceWorker } from './pwa/register.js';
import './style.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(createHead());
app.use(FloatingVue);
app.mount('#app');

registerServiceWorker(router);
