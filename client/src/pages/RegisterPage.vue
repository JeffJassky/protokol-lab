<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { startCheckout } from '../api/stripe.js';
import { PLANS } from '../../../shared/plans.js';
import GoogleSignInButton from '../components/GoogleSignInButton.vue';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const confirm = ref('');
const error = ref('');
const loading = ref(false);

// Intent carried in from the marketing page — when present, the post-register
// flow redirects the new user straight into Stripe Checkout instead of the app.
const intendedPlanId = computed(() => {
  const id = route.query.plan;
  return id && PLANS[id] && PLANS[id].pricing.requiresCheckout ? id : null;
});
const intendedInterval = computed(() => {
  const i = route.query.interval;
  return i === 'yearly' ? 'yearly' : 'monthly';
});
const intendedPlan = computed(() =>
  intendedPlanId.value ? PLANS[intendedPlanId.value] : null,
);

const passwordValid = computed(() => password.value.length >= 8);
const passwordsMatch = computed(() => password.value === confirm.value);

async function handleRegister() {
  error.value = '';
  if (!passwordValid.value) {
    error.value = 'Password must be at least 8 characters';
    return;
  }
  if (!passwordsMatch.value) {
    error.value = 'Passwords do not match';
    return;
  }
  loading.value = true;
  try {
    await auth.register(email.value, password.value);
    await postAuthRedirect();
  } catch (err) {
    error.value = err.message;
    loading.value = false;
  }
}

async function postAuthRedirect() {
  if (intendedPlanId.value) {
    await startCheckout(intendedPlanId.value, intendedInterval.value);
    return;
  }
  router.push('/');
}

async function handleGoogleCredential(credential) {
  error.value = '';
  loading.value = true;
  try {
    await auth.loginWithGoogle(credential);
    await postAuthRedirect();
  } catch (err) {
    error.value = err.message;
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>Create your account</h1>
      <p v-if="intendedPlan" class="subtitle trial-subtitle">
        Start your <strong>14-day free trial</strong> of
        <strong>{{ intendedPlan.marketing.title }}</strong>.
        No charge until the trial ends.
      </p>
      <p v-else class="subtitle">Start tracking your nutrition and weight</p>
      <GoogleSignInButton
        text="signup_with"
        @credential="handleGoogleCredential"
      />
      <div class="divider"><span>or</span></div>
      <form @submit.prevent="handleRegister">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" v-model="email" type="email" required autofocus autocomplete="email" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" v-model="password" type="password" required autocomplete="new-password" minlength="8" />
          <p class="hint">At least 8 characters</p>
        </div>
        <div class="field">
          <label for="confirm">Confirm password</label>
          <input id="confirm" v-model="confirm" type="password" required autocomplete="new-password" minlength="8" />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="btn-primary" :disabled="loading">
          <span v-if="loading">
            {{ intendedPlan ? 'Opening checkout…' : 'Creating account…' }}
          </span>
          <span v-else-if="intendedPlan">
            Continue to checkout →
          </span>
          <span v-else>Create account</span>
        </button>
      </form>
      <p class="switch">
        Already have an account?
        <RouterLink :to="intendedPlanId
          ? { path: '/login', query: { plan: intendedPlanId, interval: intendedInterval } }
          : '/login'">Sign in</RouterLink>
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

@media (max-width: 768px) {
  .auth-page {
    padding: 0;
    align-items: stretch;
    min-height: 100dvh;
  }
  .auth-card {
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
.auth-card h1 {
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
.trial-subtitle {
  padding: var(--space-3);
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
  border-radius: var(--radius-small);
  line-height: 1.5;
}
.divider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: var(--space-4) 0;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
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
