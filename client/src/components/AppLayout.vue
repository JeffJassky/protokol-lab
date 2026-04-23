<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useOnboardingStore } from '../stores/onboarding.js';
import { usePushStore } from '../stores/push.js';
import { useFonts } from '../composables/useFonts.js';
import ChatDrawer from './ChatDrawer.vue';
import OnboardingBanner from './OnboardingBanner.vue';

const auth = useAuthStore();
const onboarding = useOnboardingStore();
const pushStore = usePushStore();
const router = useRouter();
const showChat = ref(false);

const { display, body, mono, DISPLAY_FONTS, BODY_FONTS, MONO_FONTS } = useFonts();

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
        <div class="font-pickers">
          <label class="font-picker" title="Display font">
            <span class="font-picker-tag">Aa</span>
            <select v-model="display">
              <option v-for="f in DISPLAY_FONTS" :key="f.name" :value="f.name">
                {{ f.name }}
              </option>
            </select>
          </label>
          <label class="font-picker" title="Body font">
            <span class="font-picker-tag">aa</span>
            <select v-model="body">
              <option v-for="f in BODY_FONTS" :key="f.name" :value="f.name">
                {{ f.name }}
              </option>
            </select>
          </label>
          <label class="font-picker" title="Monospace font">
            <span class="font-picker-tag">0x</span>
            <select v-model="mono">
              <option v-for="f in MONO_FONTS" :key="f.name" :value="f.name">
                {{ f.name }}
              </option>
            </select>
          </label>
        </div>
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
  padding: 0 1.5rem;
  height: 56px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  flex: none;
}
.brand {
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--text);
  text-decoration: none;
}
.nav-links {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.nav-links a {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 0.875rem;
  padding: 0.375rem 0.75rem;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
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
.font-pickers {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: 0.5rem;
  padding-left: 0.6rem;
  border-left: 1px solid var(--border);
}
.font-picker {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.15rem 0.3rem 0.15rem 0.45rem;
  cursor: pointer;
  transition: border-color 0.1s;
}
.font-picker:hover { border-color: var(--border-strong); }
.font-picker-tag {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
  letter-spacing: 0.02em;
}
.font-picker select {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.78rem;
  padding: 0.15rem 0.2rem;
  cursor: pointer;
  max-width: 110px;
  outline: none;
}
.font-picker select:hover { color: var(--text); }
@media (max-width: 900px) {
  .font-pickers { display: none; }
}

.logout-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 0.3rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  margin-left: 0.5rem;
  transition: background 0.15s;
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
  padding: 1.5rem;
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
  bottom: 1.5rem;
  right: 1.5rem;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  font-size: 1.4rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px var(--primary-ring);
  z-index: 70;
  transition: background 0.15s, transform 0.15s;
}
.chat-fab:hover {
  background: var(--primary-hover);
  transform: scale(1.05);
}
</style>
