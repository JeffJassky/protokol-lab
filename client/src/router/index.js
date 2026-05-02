import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useDemoStore } from '../stores/demo.js';

// VITE_APP_ONLY=1 produces a stripped native build. The native binary
// contains only the app surface (auth edges + authed app + Privacy / Terms /
// Medical Advisory). Marketing routes and admin routes are excluded from the
// route table so their lazy-import call sites tree-shake out of the bundle.
// App Store reviewer launches the binary and sees the authed app, not a
// marketing brochure — see plans/native-app-plan.md §6.13.
const APP_ONLY = import.meta.env.VITE_APP_ONLY === '1' || import.meta.env.VITE_APP_ONLY === 'true';

// Route components are lazy-loaded so each page ships in its own chunk.
// Marketing pages don't pull Chart.js; the login flow doesn't pull the
// dashboard. Vite's prerender step (puppeteer) waits on networkidle, so
// the dynamic imports resolve before HTML is snapshotted.
//
// Public-edge pages (Privacy, Terms, MedicalAdvisory) ship in BOTH builds —
// Apple guideline 5.1.1 requires them reachable in-app.
const PrivacyPage = () => import('../pages/PrivacyPage.vue');
const TermsPage = () => import('../pages/TermsPage.vue');
const MedicalAdvisoryPage = () => import('../pages/MedicalAdvisoryPage.vue');

const LoginPage = () => import('../pages/LoginPage.vue');
const RegisterPage = () => import('../pages/RegisterPage.vue');
const StartPage = () => import('../pages/StartPage.vue');
const ForgotPasswordPage = () => import('../pages/ForgotPasswordPage.vue');
const ResetPasswordPage = () => import('../pages/ResetPasswordPage.vue');
const DashboardPage = () => import('../pages/DashboardPage.vue');
const ProfilePage = () => import('../pages/ProfilePage.vue');
const NotificationsPage = () => import('../pages/settings/NotificationsPage.vue');
const SettingsCompoundsPage = () => import('../pages/settings/CompoundsPage.vue');
const FastingSettingsPage = () => import('../pages/settings/FastingPage.vue');
const WaterSettingsPage = () => import('../pages/settings/WaterPage.vue');
const AppearancePage = () => import('../pages/settings/AppearancePage.vue');
const MetricsSettingsPage = () => import('../pages/settings/MetricsPage.vue');
const PhotosSettingsPage = () => import('../pages/settings/PhotosPage.vue');
const AccountPage = () => import('../pages/settings/AccountPage.vue');
const SubscriptionPage = () => import('../pages/settings/SubscriptionPage.vue');
const LogPage = () => import('../pages/LogPage.vue');
const WelcomePage = () => import('../pages/WelcomePage.vue');
const FoodSearchPage = () => import('../pages/FoodSearchPage.vue');
const SupportPage = () => import('../pages/SupportPage.vue');
const SupportTicketDetailPage = () => import('../pages/SupportTicketDetailPage.vue');
const FeatureRequestDetailPage = () => import('../pages/FeatureRequestDetailPage.vue');

// Marketing + admin route lazy-imports are gated by APP_ONLY. When the flag
// is set, these `import()` call sites are dead code — Vite's static
// elimination removes the unreached chunks from the bundle entirely.
const LandingPage = APP_ONLY ? null : () => import('../pages/LandingPage.vue');
const FeaturesPage = APP_ONLY ? null : () => import('../pages/FeaturesPage.vue');
const PricingPage = APP_ONLY ? null : () => import('../pages/PricingPage.vue');
const AiPage = APP_ONLY ? null : () => import('../pages/AiPage.vue');
const CompoundsPage = APP_ONLY ? null : () => import('../pages/CompoundsPage.vue');
const FaqPage = APP_ONLY ? null : () => import('../pages/FaqPage.vue');
const AboutPage = APP_ONLY ? null : () => import('../pages/AboutPage.vue');
const BlogIndexPage = APP_ONLY ? null : () => import('../pages/BlogIndexPage.vue');
const TirzepatideHalfLifePage = APP_ONLY ? null : () => import('../pages/blog/TirzepatideHalfLifePage.vue');
const WeeklyCalorieBudgetPage = APP_ONLY ? null : () => import('../pages/blog/WeeklyCalorieBudgetPage.vue');
const Glp1NauseaTimelinePage = APP_ONLY ? null : () => import('../pages/blog/Glp1NauseaTimelinePage.vue');
const OzempicVsWegovyPage = APP_ONLY ? null : () => import('../pages/blog/OzempicVsWegovyPage.vue');
const ManagingSideEffectsPage = APP_ONLY ? null : () => import('../pages/blog/ManagingSideEffectsPage.vue');
const AdhdNutritionTrackerPage = APP_ONLY ? null : () => import('../pages/blog/AdhdNutritionTrackerPage.vue');
const CompareIndexPage = APP_ONLY ? null : () => import('../pages/CompareIndexPage.vue');
const ComparisonPage = APP_ONLY ? null : () => import('../pages/ComparisonPage.vue');
const AdminLayout = APP_ONLY ? null : () => import('../components/AdminLayout.vue');
const AdminOverviewPage = APP_ONLY ? null : () => import('../pages/AdminOverviewPage.vue');
const AdminLlmUsagePage = APP_ONLY ? null : () => import('../pages/AdminLlmUsagePage.vue');
const AdminUsersPage = APP_ONLY ? null : () => import('../pages/AdminUsersPage.vue');
const AdminUserDetailPage = APP_ONLY ? null : () => import('../pages/AdminUserDetailPage.vue');
const AdminFunnelPage = APP_ONLY ? null : () => import('../pages/AdminFunnelPage.vue');
const AdminMarketingEmbedPage = APP_ONLY ? null : () => import('../pages/AdminMarketingEmbedPage.vue');
const AdminJobsPage = APP_ONLY ? null : () => import('../pages/AdminJobsPage.vue');
const AdminSupportPage = APP_ONLY ? null : () => import('../pages/AdminSupportPage.vue');
const AdminSupportTicketPage = APP_ONLY ? null : () => import('../pages/AdminSupportTicketPage.vue');
const AdminFeatureRequestPage = APP_ONLY ? null : () => import('../pages/AdminFeatureRequestPage.vue');

// Marketing routes ship only in the web build. APP_ONLY (native) excludes
// them from the route table so the lazy-import call sites tree-shake out.
const marketingRoutes = APP_ONLY ? [] : [
  { path: '/', name: 'landing', component: LandingPage, meta: { public: true, marketing: true } },
  { path: '/features', name: 'features', component: FeaturesPage, meta: { public: true, marketing: true } },
  { path: '/pricing', name: 'pricing', component: PricingPage, meta: { public: true, marketing: true } },
  { path: '/ai', name: 'ai', component: AiPage, meta: { public: true, marketing: true } },
  { path: '/compounds', name: 'compounds', component: CompoundsPage, meta: { public: true, marketing: true } },
  { path: '/faq', name: 'faq', component: FaqPage, meta: { public: true, marketing: true } },
  { path: '/about', name: 'about', component: AboutPage, meta: { public: true, marketing: true } },
  { path: '/blog', name: 'blog', component: BlogIndexPage, meta: { public: true, marketing: true } },
  { path: '/blog/tirzepatide-half-life-explained', name: 'blog-tirzepatide-half-life', component: TirzepatideHalfLifePage, meta: { public: true, marketing: true } },
  { path: '/blog/weekly-calorie-budget-for-glp1', name: 'blog-weekly-calorie-budget', component: WeeklyCalorieBudgetPage, meta: { public: true, marketing: true } },
  { path: '/blog/glp1-nausea-timeline', name: 'blog-glp1-nausea-timeline', component: Glp1NauseaTimelinePage, meta: { public: true, marketing: true } },
  { path: '/blog/ozempic-vs-wegovy-vs-compounded-semaglutide', name: 'blog-ozempic-vs-wegovy', component: OzempicVsWegovyPage, meta: { public: true, marketing: true } },
  { path: '/blog/managing-glp1-side-effects', name: 'blog-managing-side-effects', component: ManagingSideEffectsPage, meta: { public: true, marketing: true } },
  { path: '/blog/adhd-nutrition-tracker', name: 'blog-adhd-nutrition-tracker', component: AdhdNutritionTrackerPage, meta: { public: true, marketing: true } },
  { path: '/compare', name: 'compare', component: CompareIndexPage, meta: { public: true, marketing: true } },
  { path: '/compare/:slug', name: 'comparison', component: ComparisonPage, meta: { public: true, marketing: true } },
];

// Native root: no LandingPage in the bundle. '/' redirects into the app —
// the auth guard below sends unauthed users to /login from /log.
const nativeRootRoutes = APP_ONLY ? [
  { path: '/', redirect: '/log' },
] : [];

const routes = [
  ...marketingRoutes,
  ...nativeRootRoutes,
  // Public-edge pages (Privacy / Terms / Medical Advisory) ship in BOTH
  // builds. Apple guideline 5.1.1 requires them reachable in-app.
  { path: '/terms', name: 'terms', component: TermsPage, meta: { public: true, marketing: !APP_ONLY } },
  { path: '/privacy', name: 'privacy', component: PrivacyPage, meta: { public: true, marketing: !APP_ONLY } },
  { path: '/medical-advisory', name: 'medical-advisory', component: MedicalAdvisoryPage, meta: { public: true, marketing: !APP_ONLY } },
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
  { path: '/profile/settings/fasting', name: 'profile-settings-fasting', component: FastingSettingsPage, meta: { requiresAuth: true } },
  { path: '/profile/settings/water', name: 'profile-settings-water', component: WaterSettingsPage, meta: { requiresAuth: true } },
  { path: '/profile/settings/appearance', name: 'profile-settings-appearance', component: AppearancePage, meta: { requiresAuth: true } },
  { path: '/profile/settings/metrics', name: 'profile-settings-metrics', component: MetricsSettingsPage, meta: { requiresAuth: true } },
  { path: '/profile/settings/photos', name: 'profile-settings-photos', component: PhotosSettingsPage, meta: { requiresAuth: true } },
  { path: '/profile/settings/account', name: 'profile-settings-account', component: AccountPage, meta: { requiresAuth: true } },
  { path: '/profile/settings/account/subscription', name: 'profile-settings-subscription', component: SubscriptionPage, meta: { requiresAuth: true } },
  // Old routes — redirect bookmarks + in-flight Stripe redirects to the new locations.
  // /account is the legacy Stripe success/cancel URL (preserved while existing
  // checkout/portal sessions complete) — query string passes through.
  { path: '/settings', redirect: (to) => ({ path: '/profile/settings', query: to.query }) },
  { path: '/account', redirect: (to) => ({ path: '/profile/settings/account/subscription', query: to.query }) },
  { path: '/food/search', name: 'foodsearch', component: FoodSearchPage, meta: { requiresAuth: true } },
  { path: '/support', name: 'support', component: SupportPage, meta: { requiresAuth: true } },
  { path: '/support/tickets/:id', name: 'support-ticket', component: SupportTicketDetailPage, meta: { requiresAuth: true } },
  { path: '/support/features/:id', name: 'support-feature', component: FeatureRequestDetailPage, meta: { requiresAuth: true } },
  // Admin surface — web build only. APP_ONLY native build excludes the
  // entire /admin tree so the lazy-imported chunks tree-shake out.
  // AdminLayout owns the chrome (sidebar nav, theme toggle, mobile drawer).
  // hideAppChrome bypasses AppLayout so we don't double-wrap. Embedded
  // iframe pages set adminFullBleed so AdminLayout gives them an unpadded,
  // full-height pane.
  ...(APP_ONLY ? [] : [{
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true, requiresAdmin: true, hideAppChrome: true },
    children: [
      { path: '', name: 'admin', component: AdminOverviewPage },
      { path: 'llm-usage', name: 'admin-llm-usage', component: AdminLlmUsagePage },
      { path: 'funnel', name: 'admin-funnel', component: AdminFunnelPage },
      { path: 'users', name: 'admin-users', component: AdminUsersPage },
      { path: 'users/:id', name: 'admin-user-detail', component: AdminUserDetailPage },
      { path: 'support', name: 'admin-support', component: AdminSupportPage },
      { path: 'support/tickets/:id', name: 'admin-support-ticket', component: AdminSupportTicketPage },
      { path: 'support/features/:id', name: 'admin-support-feature', component: AdminFeatureRequestPage },
      { path: 'marketing-embed', name: 'admin-marketing-embed', component: AdminMarketingEmbedPage, meta: { adminFullBleed: true } },
      { path: 'jobs', name: 'admin-jobs', component: AdminJobsPage, meta: { adminFullBleed: true } },
    ],
  }]),
  // Old top-level paths — redirect bookmarks so they still land somewhere useful.
  { path: '/weight', redirect: '/dashboard' },
  { path: '/meals', redirect: '/food/search?tab=meals' },
  { path: '/food', redirect: '/log' },
  { path: '/symptoms', redirect: '/log' },
];

// Desktop app routes scroll inside `.content` (the AppLayout's inner pane),
// not the window. Vue Router's `saved` only restores window scroll, so we
// track inner-container scrollTop ourselves keyed by fullPath and restore on
// back/forward (popstate). Mobile app routes and marketing pages scroll the
// window, which the returned scroll position handles.
const innerScrollPositions = new Map();

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    return new Promise((resolve) => {
      // Wait one frame so the new view is mounted before we read/scroll.
      requestAnimationFrame(() => {
        const content = document.querySelector('main.content');
        if (content) {
          if (saved && innerScrollPositions.has(to.fullPath)) {
            content.scrollTop = innerScrollPositions.get(to.fullPath);
          } else if (to.hash) {
            const el = content.querySelector(to.hash);
            content.scrollTop = el ? el.offsetTop : 0;
          } else {
            content.scrollTop = 0;
          }
        }
        if (saved) return resolve(saved);
        if (to.hash) return resolve({ el: to.hash, behavior: 'smooth' });
        resolve({ top: 0, behavior: 'instant' });
      });
    });
  },
});

// Capture inner-container scroll before each navigation so we can restore it
// on back/forward. Runs before the auth guard; returns nothing so it never
// blocks navigation.
router.beforeEach((to, from) => {
  if (!from.fullPath) return;
  const content = document.querySelector('main.content');
  if (content) innerScrollPositions.set(from.fullPath, content.scrollTop);
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const demo = useDemoStore();

  if (!auth.checked) {
    await auth.fetchMe();
  }
  // Demo mode is web-only (§7.2). Native skips the demo store fetch — the
  // sandbox path doesn't exist there and the request would just round-trip
  // for nothing.
  if (!APP_ONLY && !demo.checked) {
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
