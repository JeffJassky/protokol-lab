import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import LandingPage from '../pages/LandingPage.vue';
import FeaturesPage from '../pages/FeaturesPage.vue';
import LoginPage from '../pages/LoginPage.vue';
import RegisterPage from '../pages/RegisterPage.vue';
import ForgotPasswordPage from '../pages/ForgotPasswordPage.vue';
import ResetPasswordPage from '../pages/ResetPasswordPage.vue';
import DashboardPage from '../pages/DashboardPage.vue';
import SettingsPage from '../pages/SettingsPage.vue';
import LogPage from '../pages/LogPage.vue';
import FoodSearchPage from '../pages/FoodSearchPage.vue';
import AdminDashboardPage from '../pages/AdminDashboardPage.vue';
import AdminUsersPage from '../pages/AdminUsersPage.vue';
import AdminUserDetailPage from '../pages/AdminUserDetailPage.vue';

const routes = [
  { path: '/', name: 'landing', component: LandingPage, meta: { public: true } },
  { path: '/features', name: 'features', component: FeaturesPage, meta: { public: true } },
  { path: '/login', name: 'login', component: LoginPage, meta: { guest: true, public: true } },
  { path: '/register', name: 'register', component: RegisterPage, meta: { guest: true, public: true } },
  { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordPage, meta: { guest: true, public: true } },
  { path: '/reset-password', name: 'reset-password', component: ResetPasswordPage, meta: { guest: true, public: true } },
  { path: '/log', name: 'log', component: LogPage, meta: { requiresAuth: true } },
  { path: '/dashboard', name: 'dashboard', component: DashboardPage, meta: { requiresAuth: true } },
  { path: '/settings', name: 'settings', component: SettingsPage, meta: { requiresAuth: true } },
  { path: '/food/search', name: 'foodsearch', component: FoodSearchPage, meta: { requiresAuth: true } },
  { path: '/admin', name: 'admin', component: AdminDashboardPage, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/users', name: 'admin-users', component: AdminUsersPage, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/users/:id', name: 'admin-user-detail', component: AdminUserDetailPage, meta: { requiresAuth: true, requiresAdmin: true } },
  // Old top-level paths — redirect bookmarks so they still land somewhere useful.
  { path: '/weight', redirect: '/dashboard' },
  { path: '/meals', redirect: '/food/search?tab=meals' },
  { path: '/food', redirect: '/log' },
  { path: '/symptoms', redirect: '/log' },
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
  if (to.meta.requiresAdmin && !auth.user?.isAdmin) {
    return { name: 'log' };
  }
  // Logged-in users on a guest-only page bounce to the app —
  // except the reset flow, which may be opened from an email while logged in elsewhere.
  if (to.meta.guest && auth.user && to.name !== 'reset-password') {
    // A plan param means the user was on the marketing flow (clicked "Start
    // trial" from a bookmark, shared link, or a second tab). Forward them to
    // Settings where the upgrade UI is — carrying the intent, not dropping it.
    if (to.query.plan) {
      return { path: '/settings', query: to.query };
    }
    return { name: 'log' };
  }
  // Logged-in users hitting the public landing go straight to the app.
  if (to.name === 'landing' && auth.user) {
    return { name: 'log' };
  }
});

export default router;
