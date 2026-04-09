<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const router = useRouter();

async function handleLogout() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="app-layout">
    <nav class="top-nav">
      <router-link to="/" class="brand">Vitality Tracker</router-link>
      <div class="nav-links">
        <router-link to="/">Dashboard</router-link>
        <router-link to="/weight">Weight</router-link>
        <router-link to="/food">Food</router-link>
        <router-link to="/settings">Settings</router-link>
        <button class="logout-btn" @click="handleLogout">Logout</button>
      </div>
    </nav>
    <main class="content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.top-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1.5rem;
  height: 56px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
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
  background: rgba(79, 70, 229, 0.08);
  font-weight: 500;
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
.content {
  max-width: 720px;
  margin: 0 auto;
  padding: 1.5rem;
}
</style>
