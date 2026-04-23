<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();

const email = ref('');
const error = ref('');
const loading = ref(false);
const submitted = ref(false);

async function handleSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.requestPasswordReset(email.value);
    submitted.value = true;
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
      <h1>Reset your password</h1>

      <template v-if="!submitted">
        <p class="subtitle">Enter your email and we'll send you a reset link.</p>
        <form @submit.prevent="handleSubmit">
          <div class="field">
            <label for="email">Email</label>
            <input id="email" v-model="email" type="email" required autofocus autocomplete="email" />
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <button type="submit" :disabled="loading">
            {{ loading ? 'Sending...' : 'Send reset link' }}
          </button>
        </form>
      </template>

      <template v-else>
        <p class="subtitle">
          If an account exists for <strong>{{ email }}</strong>, a reset link has been sent.
          Check your inbox (and spam folder). The link expires in 2 hours.
        </p>
      </template>

      <p class="switch">
        <RouterLink to="/login">Back to sign in</RouterLink>
      </p>
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
  transition: border-color 0.15s;
}
.field input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-focus);
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
  transition: background 0.15s;
}
button[type="submit"]:hover { background: var(--primary-hover); }
button:disabled { opacity: 0.6; cursor: not-allowed; }
.error {
  color: var(--danger);
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
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
