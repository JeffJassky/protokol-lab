<script setup>
import { ref, onMounted, watch } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import { useOnboardingStore } from '../stores/onboarding.js';
import { usePushStore } from '../stores/push.js';
import { useChatStarterStore } from '../stores/chatStarter.js';
import { useTheme } from '../composables/useTheme.js';
import ChatDrawer from './ChatDrawer.vue';
import OnboardingBanner from './OnboardingBanner.vue';
import OnboardingChecklist from './OnboardingChecklist.vue';
import DemoBanner from './DemoBanner.vue';
import ProfileFieldsModal from './ProfileFieldsModal.vue';
import BrandLockup from './BrandLockup.vue';
import BugReportFab from './BugReportFab.vue';

const auth = useAuthStore();
const onboarding = useOnboardingStore();
const pushStore = usePushStore();
const chatStarter = useChatStarterStore();

const showChat = ref(false);

// Two-way sync with the chatStarter store so any component (e.g., the
// Insights "Explain" button on the dashboard) can pop open the drawer.
watch(
  () => chatStarter.isOpen,
  (v) => { if (v !== showChat.value) showChat.value = v; },
);
watch(showChat, (v) => {
  if (v !== chatStarter.isOpen) {
    if (v) chatStarter.isOpen = true;
    else chatStarter.close();
  }
});

const theme = useTheme();
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
}

onMounted(async () => {
  const uid = auth.user?._id || auth.user?.id;
  if (uid) onboarding.hydrate(String(uid));
  if (pushStore.supported) {
    await pushStore.loadExistingSubscription().catch(() => {});
  }
});

watch(() => auth.user, (u) => {
  if (!u) {
    onboarding.clear();
    return;
  }
  const uid = u._id || u.id;
  if (uid) onboarding.hydrate(String(uid));
});
</script>

<template>
  <div class="app-layout">
    <DemoBanner />
    <OnboardingBanner />
    <nav class="top-nav">
      <router-link to="/" class="brand" aria-label="Protokol Lab — home">
        <BrandLockup class="brand-desktop" :size="16" :show-icon="false" />
      </router-link>
      <div class="nav-links">
        <router-link to="/log" class="nav-link">
          <svg
            class="nav-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
          <span class="nav-label">Log</span>
        </router-link>
        <router-link to="/dashboard" class="nav-link">
          <svg
            class="nav-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect width="7" height="9" x="3" y="3" rx="1" />
            <rect width="7" height="5" x="14" y="3" rx="1" />
            <rect width="7" height="9" x="14" y="12" rx="1" />
            <rect width="7" height="5" x="3" y="16" rx="1" />
          </svg>
          <span class="nav-label">Dashboard</span>
        </router-link>
        <!-- Settings + Support are tied to a real account (subscription,
             tickets) — hide in anon demo where they'd 403 on first fetch.
             Authed-in-toggle still sees them; the underlying account is real. -->
        <router-link v-if="auth.user" to="/profile" class="nav-link">
          <svg
            class="nav-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span class="nav-label">Profile</span>
        </router-link>
        <router-link
          v-if="auth.user"
          to="/support"
          class="nav-link nav-link-support"
          >Support</router-link
        >
        <router-link
          v-if="auth.user?.isAdmin"
          to="/admin"
          class="nav-link admin-link"
          >Admin</router-link
        >
        <button
          class="theme-toggle"
          type="button"
          :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <svg
            v-if="theme === 'dark'"
            class="theme-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m4.93 19.07 1.41-1.41" />
            <path d="m17.66 6.34 1.41-1.41" />
          </svg>
          <svg
            v-else
            class="theme-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>
    </nav>
    <div class="main-area" :class="{ 'chat-open': showChat }">
      <main class="content">
        <!-- App-wide setup checklist — persistent on every authed page until
             every step is complete. The component self-hides in demo mode
             and once allDone, so no v-if needed at the call site. -->
        <OnboardingChecklist />
        <router-view />
      </main>

      <ChatDrawer v-if="showChat" v-model:open="showChat" class="chat-panel" />
    </div>

    <!-- Chat toggle FAB (hidden when drawer is open) -->
    <button v-if="!showChat" class="chat-fab" @click="showChat = true">
      💬
    </button>

    <!-- Always-on bug reporter (real accounts only — demo skips it like Support nav). -->
    <BugReportFab v-if="auth.user" />

    <!-- Just-in-time profile field gate (PRD §9). Listens to a global queue;
         appears only when a feature awaits ensure([...]) and a field is missing. -->
    <ProfileFieldsModal />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
  height: 56px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-family: var(--font-display);
  text-transform: capitalize;
  font-weight: var(--font-weight-bold);
  flex: none;
}
.brand {
  display: inline-flex;
  align-items: center;
  color: var(--text);
  text-decoration: none;
}
.brand-desktop { display: inline-flex; }
.nav-links {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.nav-links a {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--font-size-s);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-small);
  transition: background var(--transition-base), color var(--transition-base);
}
/* Desktop: hide stacked icons, render text only. */
.nav-icon { display: none; }
.nav-links a:hover {
  background: var(--bg);
  color: var(--text);
}
.nav-links a.router-link-exact-active {
  color: var(--primary);
  background: var(--primary-soft);
  font-weight: var(--font-weight-medium);
}
.nav-links a.admin-link {
  color: var(--primary);
  border: 1px solid var(--border);
  margin-left: var(--space-1);
}
.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  margin-left: var(--space-2);
  background: transparent;
  border: none;
  cursor: pointer;
  line-height: 1;
}
.theme-toggle:hover .theme-icon { color: var(--text); }
.theme-icon {
  width: 16px;
  height: 16px;
  color: var(--text-secondary);
  transition: color var(--transition-fast);
}

.main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.content {
  flex: 1;
  min-width: 0;
  /* Extra bottom whitespace so the last card on a page doesn't sit flush
     against the viewport edge — gives a comfortable scroll-past gutter. */
  padding: var(--space-6) var(--space-6) calc(var(--space-6) + 70px);
  overflow-y: auto;
}
.content > :deep(*) {
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}
.chat-panel {
  width: 50%;
  flex: none;
  border-left: 1px solid var(--border);
}

.chat-fab {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  width: 52px;
  height: 52px;
  border-radius: var(--radius-pill);
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  font-size: var(--font-size-xl);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px var(--primary-ring);
  z-index: 70;
  transition: background var(--transition-base), transform var(--transition-base);
}
.chat-fab:hover {
  background: var(--primary-hover);
  transform: scale(1.05);
}

/* ───────────────────────────────────────────────────────────────────────
   Mobile (≤ 768px)
   - Top nav becomes a bottom-fixed nav bar.
   - Brand is hidden (logout lives on /settings).
   - Content goes edge-to-edge with no horizontal padding.
   - Chat takes over the full viewport when open.
   - Bottom-safe-area inset keeps iOS home indicator clear.
   ─────────────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  /* Single scroll container = window. Drop the locked-shell + inner-scroll
     model used on desktop so iOS rubber-band and content scroll don't fight. */
  .app-layout {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
    /* Bottom nav clearance + 70px scroll-past gutter so the last card has
       breathing room above the nav bar. */
    padding-bottom: calc(56px + env(safe-area-inset-bottom, 0) + 70px);
  }
  .main-area {
    overflow: visible;
    padding-bottom: 0;
  }
  .content {
    overflow: visible;
  }

  .top-nav .theme-toggle {
    display: none;
  }
  .top-nav .brand-desktop { display: none; }

  .top-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    z-index: 80;
    height: auto;
    padding: 0;
    background: var(--bg);
    border-top: 1px solid var(--border);
    border-bottom: none;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .nav-links {
    flex: 1;
    justify-content: space-around;
    gap: 0;
  }
  .nav-links a {
    flex: 1;
    text-align: center;
    padding: 8px 4px;
    border-radius: 0;
    font-size: 10px;
    letter-spacing: 0.03em;
  }
  /* iOS-style stacked icon + label for primary nav items. */
  .nav-link {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .nav-icon {
    display: block;
    width: 22px;
    height: 22px;
  }
  .nav-label { display: block; line-height: 1; }
  .nav-links a.router-link-exact-active {
    background: var(--surface);
    color: var(--primary);
    box-shadow: inset 0 2px 0 var(--primary);
  }
  .nav-links a.admin-link {
    border: none;
    margin-left: 0;
  }
  /* Bottom bar holds 4 slots on mobile; Support stays desktop-only. */
  .nav-link-support { display: none; }
  .theme-toggle {
    flex: 0 0 auto;
    margin-left: 0;
    padding: 12px 14px;
    width: auto;
    height: auto;
  }

  /* Edge-to-edge content; per-page cards keep their own padding. */
  .content {
    padding: 0;
  }
  .content > :deep(*) {
    max-width: none;
  }

  /* Chat full-screen overlay on mobile. */
  .chat-panel {
    position: fixed;
    inset: 0;
    width: 100%;
    border-left: none;
    z-index: 90;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  /* Hide the FAB while chat is open, and lift it above the bottom nav. */
  .chat-fab {
    bottom: calc(56px + env(safe-area-inset-bottom, 0) + var(--space-3));
    right: var(--space-3);
  }
}
</style>
