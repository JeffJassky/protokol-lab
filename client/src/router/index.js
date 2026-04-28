import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useDemoStore } from '../stores/demo.js';

// Route components are lazy-loaded so each page ships in its own chunk.
// Marketing pages don't pull Chart.js; the login flow doesn't pull the
// dashboard. Vite's prerender step (puppeteer) waits on networkidle, so
// the dynamic imports resolve before HTML is snapshotted.
const LandingPage = () => import('../pages/LandingPage.vue');
const FeaturesPage = () => import('../pages/FeaturesPage.vue');
const PricingPage = () => import('../pages/PricingPage.vue');
const AiPage = () => import('../pages/AiPage.vue');
const CompoundsPage = () => import('../pages/CompoundsPage.vue');
const FaqPage = () => import('../pages/FaqPage.vue');
const AboutPage = () => import('../pages/AboutPage.vue');
const TermsPage = () => import('../pages/TermsPage.vue');
const PrivacyPage = () => import('../pages/PrivacyPage.vue');
const MedicalAdvisoryPage = () => import('../pages/MedicalAdvisoryPage.vue');
const BlogIndexPage = () => import('../pages/BlogIndexPage.vue');
const TirzepatideHalfLifePage = () => import('../pages/blog/TirzepatideHalfLifePage.vue');
const WeeklyCalorieBudgetPage = () => import('../pages/blog/WeeklyCalorieBudgetPage.vue');
const Glp1NauseaTimelinePage = () => import('../pages/blog/Glp1NauseaTimelinePage.vue');
const OzempicVsWegovyPage = () => import('../pages/blog/OzempicVsWegovyPage.vue');
const ManagingSideEffectsPage = () => import('../pages/blog/ManagingSideEffectsPage.vue');
const AdhdNutritionTrackerPage = () => import('../pages/blog/AdhdNutritionTrackerPage.vue');
const CompareIndexPage = () => import('../pages/CompareIndexPage.vue');
const ComparisonPage = () => import('../pages/ComparisonPage.vue');
const LoginPage = () => import('../pages/LoginPage.vue');
const RegisterPage = () => import('../pages/RegisterPage.vue');
const StartPage = () => import('../pages/StartPage.vue');
const ForgotPasswordPage = () => import('../pages/ForgotPasswordPage.vue');
const ResetPasswordPage = () => import('../pages/ResetPasswordPage.vue');
const DashboardPage = () => import('../pages/DashboardPage.vue');
const ProfilePage = () => import('../pages/ProfilePage.vue');
const NotificationsPage = () => import('../pages/settings/NotificationsPage.vue');
const SettingsCompoundsPage = () => import('../pages/settings/CompoundsPage.vue');
const AppearancePage = () => import('../pages/settings/AppearancePage.vue');
const AccountPage = () => import('../pages/settings/AccountPage.vue');
const SubscriptionPage = () => import('../pages/settings/SubscriptionPage.vue');
const LogPage = () => import('../pages/LogPage.vue');
const WelcomePage = () => import('../pages/WelcomePage.vue');
const FoodSearchPage = () => import('../pages/FoodSearchPage.vue');
const AdminDashboardPage = () => import('../pages/AdminDashboardPage.vue');
const AdminUsersPage = () => import('../pages/AdminUsersPage.vue');
const AdminUserDetailPage = () => import('../pages/AdminUserDetailPage.vue');
const SupportPage = () => import('../pages/SupportPage.vue');
const SupportTicketDetailPage = () => import('../pages/SupportTicketDetailPage.vue');
const FeatureRequestDetailPage = () => import('../pages/FeatureRequestDetailPage.vue');
const AdminSupportPage = () => import('../pages/AdminSupportPage.vue');
const AdminSupportTicketPage = () => import('../pages/AdminSupportTicketPage.vue');
const AdminFeatureRequestPage = () => import('../pages/AdminFeatureRequestPage.vue');

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
  { path: '/profile', name: 'profile', component: ProfilePage, meta: { requiresAuth: true } },
  // Settings hub was inlined into the Profile page (sub-page list at the bottom).
  // Keep the URL alive as a redirect so any deep links land on Profile.
  { path: '/profile/settings', redirect: '/profile' },
  { path: '/profile/settings/notifications', name: 'profile-settings-notifications', component: NotificationsPage, meta: { requiresAuth: true } },
  { path: '/profile/settings/compounds', name: 'profile-settings-compounds', component: SettingsCompoundsPage, meta: { requiresAuth: true } },
  { path: '/profile/settings/appearance', name: 'profile-settings-appearance', component: AppearancePage, meta: { requiresAuth: true } },
  { path: '/profile/settings/account', name: 'profile-settings-account', component: AccountPage, meta: { requiresAuth: true } },
  { path: '/profile/settings/account/subscription', name: 'profile-settings-subscription', component: SubscriptionPage, meta: { requiresAuth: true } },
  // Old routes — redirect bookmarks + in-flight Stripe redirects to the new locations.
  // /account is the legacy Stripe success/cancel URL (preserved while existing
  // checkout/portal sessions complete) — query string passes through.
  { path: '/settings', redirect: (to) => ({ path: '/profile/settings', query: to.query }) },
  { path: '/account', redirect: (to) => ({ path: '/profile/settings/account/subscription', query: to.query }) },
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
    // the subscription page where the upgrade UI is — carrying the intent.
    if (to.query.plan) {
      return { path: '/profile/settings/account/subscription', query: to.query };
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

// Swap the viewport meta per route. App routes lock zoom so the authed UI
// feels like a native mobile app; marketing routes keep pinch-zoom for
// accessibility and SEO.
const APP_VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
const MARKETING_VIEWPORT =
  'width=device-width, initial-scale=1.0, viewport-fit=cover';
router.afterEach((to) => {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  meta.setAttribute('content', to.meta?.marketing ? MARKETING_VIEWPORT : APP_VIEWPORT);
});

export default router;
