<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

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
          <button type="submit" :disabled="loading">
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
  border-radius: 12px;
  padding: 2.5rem 2rem;
}
.auth-card h1 {
  font-size: 1.5rem;
  text-align: center;
  margin-bottom: 0.25rem;
}
.subtitle {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 1.5rem;
  line-height: 1.4;
}
.field {
  margin-bottom: 1rem;
}
.field label {
  display: block;
  margin-bottom: 0.3rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text);
}
.field input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.95rem;
  background: var(--bg);
  color: var(--text);
}
.field input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-focus);
}
.hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin: 0.3rem 0 0;
}
button[type="submit"] {
  width: 100%;
  padding: 0.6rem;
  margin-top: 0.5rem;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: 8px;
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}
button[type="submit"]:hover { background: var(--primary-hover); }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.error {
  color: var(--danger);
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}
.error-block {
  color: var(--danger);
  font-size: 0.9rem;
  text-align: center;
  margin: 1rem 0;
}
.switch {
  text-align: center;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin: 1.25rem 0 0;
}
.switch a {
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
}
.switch a:hover { text-decoration: underline; }
</style>
