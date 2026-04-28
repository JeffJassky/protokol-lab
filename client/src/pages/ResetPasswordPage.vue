<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import BrandWordmark from '../components/BrandWordmark.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const token = computed(() => String(route.query.token || ''));

const password = ref('');
const confirm = ref('');
const error = ref('');
const loading = ref(false);
const done = ref(false);

async function handleSubmit() {
  error.value = '';
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters';
    return;
  }
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match';
    return;
  }
  if (!token.value) {
    error.value = 'Reset link is missing or invalid';
    return;
  }
  loading.value = true;
  try {
    await auth.resetPassword(token.value, password.value);
    done.value = true;
    setTimeout(() => router.push('/login'), 2000);
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <router-link to="/" class="auth-brand-link" aria-label="Home">
        <BrandWordmark class="auth-brand" :size="24" />
      </router-link>
      <h1>Choose a new password</h1>

      <template v-if="!token">
        <p class="error-block">This reset link is missing a token. Request a new link.</p>
        <p class="switch"><RouterLink to="/forgot-password">Request reset link</RouterLink></p>
      </template>

      <template v-else-if="done">
        <p class="subtitle">Password updated. Redirecting to sign in...</p>
      </template>

      <template v-else>
        <p class="subtitle">Enter a new password for your account.</p>
        <form @submit.prevent="handleSubmit">
          <div class="field">
            <label for="password">New password</label>
            <input id="password" v-model="password" type="password" required autofocus autocomplete="new-password" minlength="8" />
            <p class="hint">At least 8 characters</p>
          </div>
          <div class="field">
            <label for="confirm">Confirm password</label>
            <input id="confirm" v-model="confirm" type="password" required autocomplete="new-password" minlength="8" />
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <button type="submit" class="btn-primary" :disabled="loading">
            {{ loading ? 'Updating...' : 'Update password' }}
          </button>
        </form>
        <p class="switch"><RouterLink to="/login">Back to sign in</RouterLink></p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg);
}
.auth-card {
  width: 100%;
  max-width: 380px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-10) var(--space-8);
}
.auth-card h1 {
  font-size: var(--font-size-xl);
  text-align: center;
  margin-bottom: var(--space-1);
}
.auth-brand {
  display: flex;
  justify-content: center;
  margin-bottom: var(--space-6);
}
.subtitle {
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  margin-bottom: var(--space-6);
  line-height: 1.4;
}
.field {
  margin-bottom: var(--space-4);
}
.field label {
  display: block;
  margin-bottom: var(--space-1);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-medium);
  color: var(--text);
}
.field input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-m);
}
.hint {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin: var(--space-1) 0 0;
}
.btn-primary[type="submit"] {
  width: 100%;
  margin-top: var(--space-2);
}
.error {
  color: var(--danger);
  font-size: var(--font-size-s);
  margin-bottom: var(--space-2);
}
.error-block {
  color: var(--danger);
  font-size: var(--font-size-s);
  text-align: center;
  margin: var(--space-4) 0;
}
.switch {
  text-align: center;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  margin: var(--space-5) 0 0;
}
.switch a {
  color: var(--primary);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
}
.switch a:hover { text-decoration: underline; }
</style>
