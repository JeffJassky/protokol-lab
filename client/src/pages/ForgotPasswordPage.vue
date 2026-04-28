<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import BrandWordmark from '../components/BrandWordmark.vue';

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
      <router-link to="/" class="auth-brand-link" aria-label="Home">
        <BrandWordmark class="auth-brand" :size="24" />
      </router-link>
      <h1>Reset your password</h1>

      <template v-if="!submitted">
        <p class="subtitle">Enter your email and we'll send you a reset link.</p>
        <form @submit.prevent="handleSubmit">
          <div class="field">
            <label for="email">Email</label>
            <input id="email" v-model="email" type="email" required autofocus autocomplete="email" />
          </div>
          <p v-if="error" class="error">{{ error }}</p>
          <button type="submit" class="btn-primary" :disabled="loading">
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
.btn-primary[type="submit"] {
  width: 100%;
  margin-top: var(--space-2);
}
.error {
  color: var(--danger);
  font-size: var(--font-size-s);
  margin-bottom: var(--space-2);
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
