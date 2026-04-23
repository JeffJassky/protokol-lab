import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import LoginPage from '../pages/LoginPage.vue';
import RegisterPage from '../pages/RegisterPage.vue';
import ForgotPasswordPage from '../pages/ForgotPasswordPage.vue';
import ResetPasswordPage from '../pages/ResetPasswordPage.vue';
import DashboardPage from '../pages/DashboardPage.vue';
import SettingsPage from '../pages/SettingsPage.vue';
import LogPage from '../pages/LogPage.vue';
import FoodSearchPage from '../pages/FoodSearchPage.vue';

const routes = [
  { path: '/login', name: 'login', component: LoginPage, meta: { guest: true } },
  { path: '/register', name: 'register', component: RegisterPage, meta: { guest: true } },
  { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordPage, meta: { guest: true } },
  { path: '/reset-password', name: 'reset-password', component: ResetPasswordPage, meta: { guest: true } },
  { path: '/', name: 'log', component: LogPage, meta: { requiresAuth: true } },
  { path: '/dashboard', name: 'dashboard', component: DashboardPage, meta: { requiresAuth: true } },
  { path: '/settings', name: 'settings', component: SettingsPage, meta: { requiresAuth: true } },
  { path: '/food/search', name: 'foodsearch', component: FoodSearchPage, meta: { requiresAuth: true } },
  // Old top-level paths — redirect bookmarks so they still land somewhere useful.
  { path: '/log', redirect: '/' },
  { path: '/weight', redirect: '/dashboard' },
  { path: '/meals', redirect: '/food/search?tab=meals' },
  { path: '/food', redirect: '/' },
  { path: '/symptoms', redirect: '/' },
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
  // Logged-in users landing on a guest page bounce to the app —
  // except the reset flow, which may be opened from an email while logged in elsewhere.
  if (to.meta.guest && auth.user && to.name !== 'reset-password') {
    return { name: 'log' };
  }
});

export default router;
