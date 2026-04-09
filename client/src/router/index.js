import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import LoginPage from '../pages/LoginPage.vue';
import DashboardPage from '../pages/DashboardPage.vue';
import SettingsPage from '../pages/SettingsPage.vue';
import WeightPage from '../pages/WeightPage.vue';
import FoodLogPage from '../pages/FoodLogPage.vue';
import FoodSearchPage from '../pages/FoodSearchPage.vue';

const routes = [
  { path: '/login', name: 'login', component: LoginPage, meta: { guest: true } },
  { path: '/', name: 'dashboard', component: DashboardPage, meta: { requiresAuth: true } },
  { path: '/settings', name: 'settings', component: SettingsPage, meta: { requiresAuth: true } },
  { path: '/weight', name: 'weight', component: WeightPage, meta: { requiresAuth: true } },
  { path: '/food', name: 'foodlog', component: FoodLogPage, meta: { requiresAuth: true } },
  { path: '/food/search', name: 'foodsearch', component: FoodSearchPage, meta: { requiresAuth: true } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (!auth.checked) {
    await auth.fetchMe();
  }

  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login' };
  }
  if (to.meta.guest && auth.user) {
    return { name: 'dashboard' };
  }
});

export default router;
