<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useOnboardingStore } from '../stores/onboarding.js';
import { usePushStore } from '../stores/push.js';
import { useTheme } from '../composables/useTheme.js';
import ChatDrawer from './ChatDrawer.vue';
import OnboardingBanner from './OnboardingBanner.vue';

const auth = useAuthStore();
const onboarding = useOnboardingStore();
const pushStore = usePushStore();
const router = useRouter();
const showChat = ref(false);

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

async function handleLogout() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="app-layout">
    <OnboardingBanner />
    <nav class="top-nav">
      <router-link to="/" class="brand">Protokol Lab</router-link>
      <div class="nav-links">
        <router-link to="/">Log</router-link>
        <router-link to="/dashboard">Dashboard</router-link>
        <router-link to="/settings">Settings</router-link>
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
        <button class="logout-btn" @click="handleLogout">Logout</button>
      </div>
    </nav>
    <div class="main-area" :class="{ 'chat-open': showChat }">
      <main class="content">
        <router-view />
      </main>

      <ChatDrawer v-if="showChat" v-model:open="showChat" class="chat-panel" />
    </div>

    <!-- Chat toggle FAB (hidden when drawer is open) -->
    <button v-if="!showChat" class="chat-fab" @click="showChat = true">
      💬
    </button>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
  height: 56px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex: none;
}
.brand {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-m);
  color: var(--text);
  text-decoration: none;
}
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
.nav-links a:hover {
  background: var(--bg);
  color: var(--text);
}
.nav-links a.router-link-exact-active {
  color: var(--primary);
  background: var(--primary-soft);
  font-weight: var(--font-weight-medium);
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

.logout-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-small);
  cursor: pointer;
  font-size: var(--font-size-xs);
  margin-left: var(--space-2);
  transition: background var(--transition-base);
}
.logout-btn:hover {
  background: var(--bg);
}
.main-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.content {
  flex: 1;
  min-width: 0;
  padding: var(--space-6);
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
</style>
