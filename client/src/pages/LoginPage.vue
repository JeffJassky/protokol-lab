<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { startCheckout } from '../api/stripe.js';
import { PLANS } from '../../../shared/plans.js';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

const intendedPlanId = computed(() => {
  const id = route.query.plan;
  return id && PLANS[id] && PLANS[id].pricing.requiresCheckout ? id : null;
});
const intendedInterval = computed(() =>
  route.query.interval === 'yearly' ? 'yearly' : 'monthly',
);

async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(email.value, password.value);
    if (intendedPlanId.value) {
      await startCheckout(intendedPlanId.value, intendedInterval.value);
      return;
    }
    router.push('/');
  } catch (err) {
    error.value = err.message;
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1>Protokol Lab</h1>
      <p class="subtitle">Track your nutrition and weight</p>
      <form @submit.prevent="handleLogin">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" v-model="email" type="email" required autofocus />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" v-model="password" type="password" required />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="btn-primary" :disabled="loading">
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>
      <p class="forgot">
        <RouterLink to="/forgot-password">Forgot your password?</RouterLink>
      </p>
      <p class="switch">
        Don't have an account?
        <RouterLink :to="intendedPlanId
          ? { path: '/register', query: { plan: intendedPlanId, interval: intendedInterval } }
          : '/register'">Create one</RouterLink>
      </p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg);
}
.login-card {
  width: 100%;
  max-width: 380px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-10) var(--space-8);
}

@media (max-width: 768px) {
  .login-page {
    padding: 0;
    align-items: stretch;
    min-height: 100dvh;
  }
  .login-card {
    max-width: none;
    border: none;
    border-radius: 0;
    padding: var(--space-8) var(--space-4);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
  }
}
.login-card h1 {
  font-size: var(--font-size-xl);
  text-align: center;
  margin-bottom: var(--space-1);
}
.subtitle {
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  margin-bottom: var(--space-6);
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
.forgot {
  text-align: center;
  font-size: var(--font-size-s);
  margin: var(--space-4) 0 0;
}
.forgot a {
  color: var(--primary);
  text-decoration: none;
}
.forgot a:hover { text-decoration: underline; }
.switch {
  text-align: center;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  margin: var(--space-3) 0 0;
}
.switch a {
  color: var(--primary);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
}
.switch a:hover { text-decoration: underline; }
</style>
