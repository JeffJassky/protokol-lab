<script setup>
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useTheme } from '../composables/useTheme.js';
import BrandLockup from './BrandLockup.vue';

const route = useRoute();
const auth = useAuthStore();
const theme = useTheme();

const drawerOpen = ref(false);
function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
}
function closeDrawer() {
  drawerOpen.value = false;
}

// Embedded routes need full-bleed (iframe should fill the pane). Other admin
// pages get the standard padded content well.
const fullBleed = computed(() => Boolean(route.meta?.adminFullBleed));

const internal = [
  { to: '/admin', label: 'Overview', exact: true, icon: 'grid' },
  { to: '/admin/llm-usage', label: 'LLM Usage', icon: 'cpu' },
  { to: '/admin/funnel', label: 'Funnel', icon: 'funnel' },
  { to: '/admin/users', label: 'Users', icon: 'users' },
  { to: '/admin/support', label: 'Support', icon: 'lifebuoy' },
];

const embedded = [
  { to: '/admin/marketing-embed', label: 'Marketing', icon: 'megaphone' },
  { to: '/admin/jobs', label: 'Jobs (Agenda)', icon: 'clock' },
];

const external = [
  { href: 'https://jeff-jassky.sentry.io/issues/', label: 'Sentry' },
  { href: 'https://dashboard.stripe.com/', label: 'Stripe Dashboard' },
  { href: 'https://cloud.digitalocean.com/apps', label: 'DigitalOcean' },
  { href: 'https://github.com/JeffJassky/protokol-lab', label: 'GitHub' },
];
</script>

<template>
  <div class="admin-shell" :class="{ 'drawer-open': drawerOpen }">
    <button
      type="button"
      class="hamburger"
      :aria-expanded="drawerOpen"
      aria-label="Toggle admin menu"
      @click="drawerOpen = !drawerOpen"
    >
      <span></span><span></span><span></span>
    </button>

    <aside class="sidebar" @click="closeDrawer">
      <div class="brand-row">
        <router-link to="/log" class="back-to-app" title="Back to app">←</router-link>
        <BrandLockup :size="14" :show-icon="false" />
        <span class="badge">admin</span>
      </div>

      <nav class="nav-section">
        <div class="section-label">Dashboard</div>
        <router-link
          v-for="item in internal"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: item.exact ? route.path === item.to : route.path.startsWith(item.to) }"
        >
          {{ item.label }}
        </router-link>
      </nav>

      <nav class="nav-section">
        <div class="section-label">Embedded tools</div>
        <router-link
          v-for="item in embedded"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ active: route.path.startsWith(item.to) }"
        >
          {{ item.label }}
        </router-link>
      </nav>

      <nav class="nav-section">
        <div class="section-label">External</div>
        <a
          v-for="item in external"
          :key="item.href"
          :href="item.href"
          target="_blank"
          rel="noopener noreferrer"
          class="nav-item external"
        >
          {{ item.label }} <span class="ext-mark">↗</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <div class="user-row" v-if="auth.user">
          <span class="user-email" :title="auth.user.email">{{ auth.user.email }}</span>
        </div>
        <button class="theme-btn" type="button" @click="toggleTheme">
          {{ theme === 'dark' ? '☀ Light' : '☾ Dark' }}
        </button>
      </div>
    </aside>

    <main class="content" :class="{ 'full-bleed': fullBleed }">
      <router-view />
    </main>

    <button
      v-if="drawerOpen"
      class="drawer-backdrop"
      type="button"
      aria-label="Close menu"
      @click="closeDrawer"
    ></button>
  </div>
</template>

<style scoped>
.admin-shell {
  display: flex;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
}

.sidebar {
  flex: 0 0 240px;
  width: 240px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 16px 0;
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 16px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}
.back-to-app {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 18px;
  line-height: 1;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
}
.back-to-app:hover {
  color: var(--text);
  border-color: var(--text-secondary);
}
.badge {
  margin-left: auto;
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--primary);
  border: 1px solid var(--primary);
  padding: 2px 6px;
  border-radius: var(--radius-small);
  font-family: var(--font-display);
  font-weight: 700;
}

.nav-section {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}
.section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-tertiary, var(--text-secondary));
  font-family: var(--font-display);
  font-weight: 700;
  padding: 8px 16px 6px;
}
.nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px;
  border-left: 2px solid transparent;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.nav-item:hover {
  background: var(--bg);
  color: var(--text);
}
.nav-item.active,
.nav-item.router-link-active {
  background: var(--primary-soft);
  color: var(--primary);
  border-left-color: var(--primary);
  font-weight: 600;
}
.nav-item.external {
  color: var(--text-secondary);
}
.ext-mark {
  font-size: 11px;
  opacity: 0.6;
}

.sidebar-footer {
  margin-top: auto;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.user-row {
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.theme-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
  border-radius: var(--radius-small);
  font-family: inherit;
}
.theme-btn:hover {
  color: var(--text);
  border-color: var(--text-secondary);
}

.content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}
.content.full-bleed {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.content :deep(.admin-page) {
  max-width: 1280px;
  margin: 0 auto;
}

.hamburger {
  display: none;
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 110;
  width: 40px;
  height: 40px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  cursor: pointer;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
}
.hamburger span {
  display: block;
  width: 18px;
  height: 2px;
  background: var(--text);
  transition: transform var(--transition-fast);
}

.drawer-backdrop {
  display: none;
}

@media (max-width: 900px) {
  .sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 105;
    transform: translateX(-100%);
    transition: transform var(--transition-base);
    box-shadow: 4px 0 20px rgba(0, 0, 0, 0.2);
  }
  .admin-shell.drawer-open .sidebar {
    transform: translateX(0);
  }
  .hamburger {
    display: flex;
  }
  .drawer-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 104;
    background: rgba(0, 0, 0, 0.4);
    border: none;
    cursor: pointer;
  }
  .content {
    padding-top: 56px;
  }
}
</style>
