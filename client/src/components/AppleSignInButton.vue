<script setup>
import { ref } from 'vue';
import { isNativePlatform } from '../api/auth-token.js';

// Sign in with Apple. Apple guideline 4.8 requires this button on any iOS
// app that offers a third-party login, so we only render it on Capacitor.
// Web Sign in with Apple needs a Service ID + redirect URL configured in
// the Apple Developer portal, neither of which is set up yet — leave that
// for when web becomes the target.
//
// The native flow runs through @capgo/capacitor-social-login (same plugin
// as Google). It returns an Apple identity token JWT plus an optional
// `profile` block with name + email — only present on the FIRST sign-in
// for a given user. The server's /api/auth/apple route handles both first
// and subsequent sign-ins, but we forward fullName here so the first-time
// user record gets a sensible displayName.

const props = defineProps({
  // Match GoogleSignInButton's prop so callers can pass the same string in
  // both spots.
  text: { type: String, default: 'continue_with' },
});
const emit = defineEmits(['credential', 'error']);

const busy = ref(false);

const label = {
  continue_with: 'Continue with Apple',
  signup_with: 'Sign up with Apple',
  signin_with: 'Sign in with Apple',
}[props.text] || 'Continue with Apple';

async function nativeSignIn() {
  if (busy.value) return;
  busy.value = true;
  try {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    const res = await SocialLogin.login({
      provider: 'apple',
      options: { scopes: ['name', 'email'] },
    });
    const idToken = res?.result?.idToken;
    if (!idToken) {
      emit('error', new Error('Apple sign-in returned no identity token'));
      return;
    }
    const profile = res?.result?.profile || {};
    emit('credential', {
      identityToken: idToken,
      // Untrusted display-name hint — server treats it as optional metadata,
      // never as identity.
      fullName: {
        givenName: profile.givenName || null,
        familyName: profile.familyName || null,
      },
    });
  } catch (err) {
    const code = err?.code;
    const msg = String(err?.message || err || '').toLowerCase();
    if (code === 'USER_CANCELLED' || msg.includes('cancel')) return;
    emit('error', err);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="isNativePlatform()" class="apple-btn">
    <button
      type="button"
      class="apple-btn-native"
      :disabled="busy"
      @click="nativeSignIn"
    >
      <span class="apple-icon" aria-hidden="true">
        <!-- Apple logo glyph — solid white on black per Apple HIG. -->
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path
            fill="currentColor"
            d="M16.365 1.43c0 1.14-.46 2.235-1.205 3.04-.785.85-2.06 1.51-3.135 1.43-.13-1.13.43-2.31 1.165-3.05.81-.835 2.18-1.46 3.175-1.42zM20.92 17.31c-.5 1.16-1.1 2.24-1.85 3.16-.99 1.22-2.32 2.74-3.97 2.75-1.49.01-1.87-.97-3.89-.96-2.02.01-2.44.98-3.93.97-1.65-.02-2.91-1.4-3.9-2.62C-.78 15.2.43 8.36 4.71 6.78c1.27-.47 2.46-.42 3.5.05.94.43 1.79.43 2.74-.02.95-.45 2.18-.6 3.55-.13 2.66.92 3.7 3.74 3.7 3.74-.04.02-2.5 1.46-2.46 4.34.05 3.45 3.05 4.6 3.18 4.65z"
          />
        </svg>
      </span>
      <span>{{ busy ? 'Signing in…' : label }}</span>
    </button>
  </div>
</template>

<style scoped>
.apple-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}
.apple-btn-native {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  /* Apple HIG: black button with white text, or vice-versa. We follow the
     dark-on-light convention for consistency with the Google button — the
     contrast vs. the page surface keeps it visually distinct. */
  background: #000;
  color: #fff;
  border: 1px solid #000;
  border-radius: var(--radius-medium);
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: opacity var(--transition-fast);
}
.apple-btn-native:hover:not(:disabled) {
  opacity: 0.92;
}
.apple-btn-native:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.apple-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
