<script setup>
import { onMounted, ref, useTemplateRef } from 'vue';
import { isNativePlatform } from '../api/auth-token.js';

const props = defineProps({
  // GIS button config — see https://developers.google.com/identity/gsi/web/reference/js-reference#GsiButtonConfiguration
  text: { type: String, default: 'continue_with' },
});
const emit = defineEmits(['credential', 'error']);

const target = useTemplateRef('target');
const unavailable = ref(false);
const nativeBusy = ref(false);

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

// Native (Capacitor) goes through @capgo/capacitor-social-login's native
// Google SDK — the GIS popup is unreliable inside WKWebView. Web continues
// with GIS so the One Tap / popup UX stays unchanged. Same server-side
// /api/auth/google endpoint accepts the resulting ID token in either case.
const nativeButtonLabel = {
  continue_with: 'Continue with Google',
  signup_with: 'Sign up with Google',
  signin_with: 'Sign in with Google',
}[props.text] || 'Continue with Google';

async function nativeSignIn() {
  if (nativeBusy.value) return;
  nativeBusy.value = true;
  try {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    const res = await SocialLogin.login({ provider: 'google', options: {} });
    const idToken = res?.result?.idToken || res?.idToken;
    if (!idToken) {
      emit('error', new Error('Google sign-in returned no ID token'));
      return;
    }
    emit('credential', idToken);
  } catch (err) {
    // User-cancel and "skipped" both surface as errors with specific codes
    // depending on platform; quietly swallow them so we don't show an alert
    // for normal back-out behavior.
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('cancel') || msg.includes('skip')) return;
    emit('error', err);
  } finally {
    nativeBusy.value = false;
  }
}

// Cache the script load promise across components/mounts so we only inject one
// <script> tag per page.
let scriptPromise = null;
function loadScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('GIS script failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('GIS script failed to load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

onMounted(async () => {
  if (isNativePlatform()) return; // native renders its own button below
  if (!CLIENT_ID) {
    unavailable.value = true;
    return;
  }
  try {
    await loadScript();
    window.google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: (response) => {
        if (response?.credential) emit('credential', response.credential);
        else emit('error', new Error('No credential returned from Google'));
      },
      // We only need the popup-button flow on these pages, not the One Tap
      // bubble; leaving auto_select off prevents surprise re-auth.
      auto_select: false,
      ux_mode: 'popup',
    });
    if (target.value) {
      window.google.accounts.id.renderButton(target.value, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: props.text,
        shape: 'rectangular',
        logo_alignment: 'left',
        width: target.value.clientWidth || 320,
      });
    }
  } catch (err) {
    unavailable.value = true;
    emit('error', err);
  }
});
</script>

<template>
  <div class="google-btn">
    <button
      v-if="isNativePlatform()"
      type="button"
      class="google-btn-native"
      :disabled="nativeBusy"
      @click="nativeSignIn"
    >
      <span class="google-icon" aria-hidden="true">
        <!-- Google "G" — official multi-color glyph -->
        <svg viewBox="0 0 18 18" width="18" height="18">
          <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"/>
          <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26a5.4 5.4 0 0 1-3.04.85 5.4 5.4 0 0 1-5.07-3.74H.96v2.34A9 9 0 0 0 9 18z"/>
          <path fill="#FBBC05" d="M3.93 10.67A5.41 5.41 0 0 1 3.65 9c0-.58.1-1.14.27-1.67V4.99H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.01l2.97-2.34z"/>
          <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.99L3.93 7.33A5.4 5.4 0 0 1 9 3.58z"/>
        </svg>
      </span>
      <span>{{ nativeBusy ? 'Signing in…' : nativeButtonLabel }}</span>
    </button>
    <div v-else ref="target" class="google-btn-target"></div>
    <p v-if="unavailable" class="google-btn-fallback">
      Google sign-in is unavailable.
    </p>
  </div>
</template>

<style scoped>
.google-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.google-btn-target {
  width: 100%;
  display: flex;
  justify-content: center;
  min-height: 44px;
}
.google-btn-native {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.google-btn-native:hover:not(:disabled) {
  border-color: var(--primary);
}
.google-btn-native:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.google-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.google-btn-fallback {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin: var(--space-2) 0 0;
}
</style>
