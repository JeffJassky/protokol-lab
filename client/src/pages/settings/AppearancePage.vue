<script setup>
import { useTheme } from '../../composables/useTheme.js';

const theme = useTheme();
</script>

<template>
  <div class="appearance-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">‹ Profile</router-link>
      <h2 class="page-title">Appearance</h2>
    </div>

    <div class="card">
      <div class="field">
        <label>Theme</label>
        <div class="theme-toggle">
          <button
            type="button"
            class="theme-option"
            :class="{ active: theme === 'light' }"
            @click="theme = 'light'"
          >Light</button>
          <button
            type="button"
            class="theme-option"
            :class="{ active: theme === 'dark' }"
            @click="theme = 'dark'"
          >Dark</button>
          <button
            type="button"
            class="theme-option"
            :class="{ active: theme === 'auto' }"
            @click="theme = 'auto'"
          >System</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.appearance-page { max-width: 560px; }
.head {
  padding: var(--space-5) var(--space-5) 0;
  margin-bottom: var(--space-4);
}
.back-link {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  text-decoration: none;
  margin-bottom: var(--space-2);
  padding: var(--space-1) 0;
}
.back-link:hover { color: var(--text); }
.page-title { margin: 0; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
}

.theme-toggle {
  display: inline-flex;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: 2px;
  gap: 2px;
}
.theme-option {
  padding: 0.35rem 0.8rem;
  background: none;
  border: none;
  border-radius: var(--radius-small);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.theme-option:hover { color: var(--text); }
.theme-option.active {
  background: var(--surface);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}
</style>
