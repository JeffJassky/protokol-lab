import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import LandingPage from '../pages/LandingPage.vue';
import FeaturesPage from '../pages/FeaturesPage.vue';
import PricingPage from '../pages/PricingPage.vue';
import AiPage from '../pages/AiPage.vue';
import CompoundsPage from '../pages/CompoundsPage.vue';
import FaqPage from '../pages/FaqPage.vue';
import AboutPage from '../pages/AboutPage.vue';
import MedicalAdvisoryPage from '../pages/MedicalAdvisoryPage.vue';
import AdvancedPage from '../pages/AdvancedPage.vue';
import BlogIndexPage from '../pages/BlogIndexPage.vue';
import CompareIndexPage from '../pages/CompareIndexPage.vue';
import ComparisonPage from '../pages/ComparisonPage.vue';
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
import SupportPage from '../pages/SupportPage.vue';
import SupportTicketDetailPage from '../pages/SupportTicketDetailPage.vue';
import FeatureRequestDetailPage from '../pages/FeatureRequestDetailPage.vue';
import AdminSupportPage from '../pages/AdminSupportPage.vue';
import AdminSupportTicketPage from '../pages/AdminSupportTicketPage.vue';
import AdminFeatureRequestPage from '../pages/AdminFeatureRequestPage.vue';

const routes = [
  { path: '/', name: 'landing', component: LandingPage, meta: { public: true, marketing: true } },
  { path: '/features', name: 'features', component: FeaturesPage, meta: { public: true, marketing: true } },
  { path: '/pricing', name: 'pricing', component: PricingPage, meta: { public: true, marketing: true } },
  { path: '/ai', name: 'ai', component: AiPage, meta: { public: true, marketing: true } },
  { path: '/compounds', name: 'compounds', component: CompoundsPage, meta: { public: true, marketing: true } },
  { path: '/faq', name: 'faq', component: FaqPage, meta: { public: true, marketing: true } },
  { path: '/about', name: 'about', component: AboutPage, meta: { public: true, marketing: true } },
  { path: '/medical-advisory', name: 'medical-advisory', component: MedicalAdvisoryPage, meta: { public: true, marketing: true } },
  { path: '/advanced', name: 'advanced', component: AdvancedPage, meta: { public: true, marketing: true } },
  { path: '/blog', name: 'blog', component: BlogIndexPage, meta: { public: true, marketing: true } },
  { path: '/compare', name: 'compare', component: CompareIndexPage, meta: { public: true, marketing: true } },
  { path: '/compare/:slug', name: 'comparison', component: ComparisonPage, meta: { public: true, marketing: true } },
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
  { path: '/support', name: 'support', component: SupportPage, meta: { requiresAuth: true } },
  { path: '/support/tickets/:id', name: 'support-ticket', component: SupportTicketDetailPage, meta: { requiresAuth: true } },
  { path: '/support/features/:id', name: 'support-feature', component: FeatureRequestDetailPage, meta: { requiresAuth: true } },
  { path: '/admin/support', name: 'admin-support', component: AdminSupportPage, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/support/tickets/:id', name: 'admin-support-ticket', component: AdminSupportTicketPage, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: '/admin/support/features/:id', name: 'admin-support-feature', component: AdminFeatureRequestPage, meta: { requiresAuth: true, requiresAdmin: true } },
  // Old top-level paths — redirect bookmarks so they still land somewhere useful.
  { path: '/weight', redirect: '/dashboard' },
  { path: '/meals', redirect: '/food/search?tab=meals' },
  { path: '/food', redirect: '/log' },
  { path: '/symptoms', redirect: '/log' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  // Scroll to top on navigation between marketing pages so new SEO-page heads
  // aren't landed at mid-page from the previous scroll position.
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0, behavior: 'instant' };
  },
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
  // Logged-in users on *other* marketing pages (features/pricing/faq/etc.)
  // stay where they are — they may be researching the upgrade flow or
  // showing the pricing table to a partner.
  if (to.name === 'landing' && auth.user) {
    return { name: 'log' };
  }
});

export default router;
