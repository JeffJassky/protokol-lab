<script setup>
// Signup entry point — email+password or Google. The original PRD §9
// "three-field minimum" (compound + dose + date) was dropped: the product
// now serves non-peptide users (food/weight/symptom tracking) and gating
// signup on a peptide dose blocked legit cohorts. Compound + dose are
// captured by the /welcome wizard's StepCompounds and just-in-time prompts
// when the user opens dose-tracking features.

import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useDemoStore } from '../stores/demo.js';
import GoogleSignInButton from '../components/GoogleSignInButton.vue';
import BrandWordmark from '../components/BrandWordmark.vue';

const auth = useAuthStore();
const demo = useDemoStore();
const router = useRouter();
const route = useRoute();

const email = ref(route.query.email || '');
const password = ref('');

const error = ref('');
const loading = ref(false);

const passwordValid = computed(() => password.value.length >= 8);
const formValid = computed(() => email.value && passwordValid.value);

async function handleSubmit() {
  error.value = '';
  if (!formValid.value) {
    error.value = passwordValid.value
      ? 'Please fill in every field'
      : 'Password must be at least 8 characters';
    return;
  }
  loading.value = true;
  try {
    await auth.register(email.value, password.value);
    // The server already cleared any demo cookie + emitted demo_signup_convert
    // when register sees the cookie. Refresh the demo store so the banner
    // disappears.
    await demo.fetchStatus();
    router.push('/welcome');
  } catch (err) {
    error.value = err.message || 'Could not finish signup';
    loading.value = false;
  }
}

async function handleGoogleCredential(credential) {
  loading.value = true;
  try {
    await auth.loginWithGoogle(credential);
    await demo.fetchStatus();
    router.push('/welcome');
  } catch (err) {
    error.value = err.message;
    loading.value = false;
  }
}

onMounted(async () => {
  if (!demo.checked) await demo.fetchStatus();
});
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <BrandWordmark class="auth-brand" :size="24" />
      <h1>Create your account</h1>
      <p class="subtitle">
        Your demo data won't carry over. We'll set up the rest of your
        profile in a few quick steps right after.
      </p>

      <GoogleSignInButton text="signup_with" @credential="handleGoogleCredential" />
      <div class="divider"><span>or</span></div>

      <form @submit.prevent="handleSubmit">
        <div class="field">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            autofocus
            autocomplete="email"
          />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            minlength="8"
            autocomplete="new-password"
          />
        </div>
        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" class="submit" :disabled="loading || !formValid">
          {{ loading ? 'Creating account…' : 'Create account' }}
        </button>
      </form>

      <p class="signin-link">
        Already have an account?
        <router-link to="/login">Sign in</router-link>
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4, 16px);
  background: var(--bg);
}
.auth-card {
  width: 100%;
  max-width: 440px;
  background: var(--surface);
  border-radius: var(--radius-medium, 10px);
  padding: var(--space-6, 24px);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}
.auth-brand { display: block; margin-bottom: var(--space-4, 16px); }
h1 { margin: 0 0 var(--space-2, 8px); font-size: 22px; }
.subtitle {
  color: var(--text-secondary);
  margin: 0 0 var(--space-4, 16px);
  font-size: var(--font-size-s, 14px);
}
.divider {
  text-align: center;
  margin: var(--space-3, 12px) 0;
  color: var(--text-secondary);
  font-size: var(--font-size-xs, 12px);
  position: relative;
}
.divider::before,
.divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 40%;
  height: 1px;
  background: var(--border);
}
.divider::before { left: 0; }
.divider::after { right: 0; }
.divider span { background: var(--surface); padding: 0 var(--space-2, 8px); position: relative; }

.field {
  margin-bottom: var(--space-3, 12px);
  position: relative;
  flex: 1;
}
.field label {
  display: block;
  font-size: var(--font-size-xs, 12px);
  color: var(--text-secondary);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.field input,
.field select {
  width: 100%;
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border: 1px solid var(--border);
  border-radius: var(--radius-small, 6px);
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.field input:focus,
.field select:focus { outline: 2px solid var(--primary); outline-offset: -1px; }

.error {
  background: var(--danger-soft, #fee2e2);
  color: var(--danger, #b91c1c);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border-radius: var(--radius-small);
  font-size: var(--font-size-xs);
  margin: 0 0 var(--space-3);
}

.submit {
  width: 100%;
  padding: var(--space-3, 12px);
  background: var(--primary);
  color: var(--text-on-primary, #fff);
  border: none;
  border-radius: var(--radius-small);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  font-size: var(--font-size-s);
}
.submit[disabled] { opacity: 0.5; cursor: not-allowed; }
.submit:hover:not([disabled]) { background: var(--primary-hover); }

.signin-link {
  margin-top: var(--space-4, 16px);
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.signin-link a { color: var(--primary); text-decoration: none; }
</style>
