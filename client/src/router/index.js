import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useDemoStore } from '../stores/demo.js';
import LandingPage from '../pages/LandingPage.vue';
import FeaturesPage from '../pages/FeaturesPage.vue';
import PricingPage from '../pages/PricingPage.vue';
import AiPage from '../pages/AiPage.vue';
import CompoundsPage from '../pages/CompoundsPage.vue';
import FaqPage from '../pages/FaqPage.vue';
import AboutPage from '../pages/AboutPage.vue';
import TermsPage from '../pages/TermsPage.vue';
import PrivacyPage from '../pages/PrivacyPage.vue';
import MedicalAdvisoryPage from '../pages/MedicalAdvisoryPage.vue';
import BlogIndexPage from '../pages/BlogIndexPage.vue';
import TirzepatideHalfLifePage from '../pages/blog/TirzepatideHalfLifePage.vue';
import WeeklyCalorieBudgetPage from '../pages/blog/WeeklyCalorieBudgetPage.vue';
import Glp1NauseaTimelinePage from '../pages/blog/Glp1NauseaTimelinePage.vue';
import OzempicVsWegovyPage from '../pages/blog/OzempicVsWegovyPage.vue';
import ManagingSideEffectsPage from '../pages/blog/ManagingSideEffectsPage.vue';
import AdhdNutritionTrackerPage from '../pages/blog/AdhdNutritionTrackerPage.vue';
import CompareIndexPage from '../pages/CompareIndexPage.vue';
import ComparisonPage from '../pages/ComparisonPage.vue';
import LoginPage from '../pages/LoginPage.vue';
import RegisterPage from '../pages/RegisterPage.vue';
import StartPage from '../pages/StartPage.vue';
import ForgotPasswordPage from '../pages/ForgotPasswordPage.vue';
import ResetPasswordPage from '../pages/ResetPasswordPage.vue';
import DashboardPage from '../pages/DashboardPage.vue';
import SettingsPage from '../pages/SettingsPage.vue';
import LogPage from '../pages/LogPage.vue';
import WelcomePage from '../pages/WelcomePage.vue';
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
  { path: '/terms', name: 'terms', component: TermsPage, meta: { public: true, marketing: true } },
  { path: '/privacy', name: 'privacy', component: PrivacyPage, meta: { public: true, marketing: true } },
  { path: '/medical-advisory', name: 'medical-advisory', component: MedicalAdvisoryPage, meta: { public: true, marketing: true } },
  { path: '/blog', name: 'blog', component: BlogIndexPage, meta: { public: true, marketing: true } },
  { path: '/blog/tirzepatide-half-life-explained', name: 'blog-tirzepatide-half-life', component: TirzepatideHalfLifePage, meta: { public: true, marketing: true } },
  { path: '/blog/weekly-calorie-budget-for-glp1', name: 'blog-weekly-calorie-budget', component: WeeklyCalorieBudgetPage, meta: { public: true, marketing: true } },
  { path: '/blog/glp1-nausea-timeline', name: 'blog-glp1-nausea-timeline', component: Glp1NauseaTimelinePage, meta: { public: true, marketing: true } },
  { path: '/blog/ozempic-vs-wegovy-vs-compounded-semaglutide', name: 'blog-ozempic-vs-wegovy', component: OzempicVsWegovyPage, meta: { public: true, marketing: true } },
  { path: '/blog/managing-glp1-side-effects', name: 'blog-managing-side-effects', component: ManagingSideEffectsPage, meta: { public: true, marketing: true } },
  { path: '/blog/adhd-nutrition-tracker', name: 'blog-adhd-nutrition-tracker', component: AdhdNutritionTrackerPage, meta: { public: true, marketing: true } },
  { path: '/compare', name: 'compare', component: CompareIndexPage, meta: { public: true, marketing: true } },
  { path: '/compare/:slug', name: 'comparison', component: ComparisonPage, meta: { public: true, marketing: true } },
  { path: '/login', name: 'login', component: LoginPage, meta: { guest: true, public: true } },
  { path: '/register', name: 'register', component: RegisterPage, meta: { guest: true, public: true } },
  // Demo-mode converter signup. Same guest gate as /register; both routes
  // now collect email + password (or Google) and route to the /welcome
  // wizard for profile setup. See plans/demo-mode.md §9.
  { path: '/start', name: 'start', component: StartPage, meta: { guest: true, public: true } },
  { path: '/forgot-password', name: 'forgot-password', component: ForgotPasswordPage, meta: { guest: true, public: true } },
  { path: '/reset-password', name: 'reset-password', component: ResetPasswordPage, meta: { guest: true, public: true } },
  { path: '/welcome', name: 'welcome', component: WelcomePage, meta: { requiresAuth: true, hideAppChrome: true } },
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
  const demo = useDemoStore();

  if (!auth.checked) {
    await auth.fetchMe();
  }
  if (!demo.checked) {
    await demo.fetchStatus();
  }

  // Anonymous demo sessions count as "authenticated enough" for app routes —
  // they have a sandbox and the data routes scope to it. Real auth only
  // matters for the auth-only edges (settings/billing/etc), which are
  // protected server-side.
  const hasSession = Boolean(auth.user) || demo.mode === 'anon';

  if (to.meta.requiresAuth && !hasSession) {
    return { name: 'login' };
  }
  if (to.meta.requiresAdmin && !auth.user?.isAdmin) {
    return { name: 'log' };
  }
  // Force unfinished real users through the wizard. Demo sessions skip this —
  // their sandbox arrives pre-populated.
  if (
    auth.user &&
    !auth.user.onboardingComplete &&
    to.meta.requiresAuth &&
    to.name !== 'welcome'
  ) {
    return { name: 'welcome' };
  }
  // Already onboarded — don't let users land on /welcome again.
  if (to.name === 'welcome' && auth.user?.onboardingComplete) {
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
  // Demo sessions are intentionally NOT redirected — visitors should be
  // able to navigate back to marketing (and from there optionally restart
  // the demo or sign up). The "Log" nav link points at /log directly so
  // it doesn't fight this.
  if (to.name === 'landing' && auth.user) {
    return { name: 'log' };
  }
});

export default router;
