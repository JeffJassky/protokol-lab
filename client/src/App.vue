<script setup>
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useDemoStore } from './stores/demo.js';
import { useUpgradeModalStore } from './stores/upgradeModal.js';
import { registerPlanLimitHandler } from './api/index.js';
import { useTheme } from './composables/useTheme.js';
import { isNativePlatform } from './api/auth-token.js';
import AppLayout from './components/AppLayout.vue';
import UpgradeModal from './components/UpgradeModal.vue';
import ForceUpdateModal from './components/ForceUpdateModal.vue';

const auth = useAuthStore();
const demo = useDemoStore();
const route = useRoute();
const upgradeModal = useUpgradeModalStore();

useTheme();

// Server denials (403 plan_limit_exceeded) auto-open the upgrade modal so
// every caller doesn't need to wire it.
onMounted(() => {
  registerPlanLimitHandler((body) => upgradeModal.openFromDenial(body));
});

// Native splash is held by capacitor.config (`launchAutoHide: false`) so
// cold start doesn't flash a blank shell while Pinia hydrates and
// `auth.fetchMe()` resolves. We hide it manually once the auth check
// completes — by then Vue has rendered the first authed view and we have
// either a user, a redirect to /login, or a known unauthed state.
let splashHidden = false;
async function hideSplashIfNative(reason) {
  if (splashHidden || !isNativePlatform()) return;
  splashHidden = true;
  // eslint-disable-next-line no-console
  console.log(`[splash] hide (${reason})`);
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch (_e) {
    // Splash plugin missing or already hidden — ignore.
  }
}

if (auth.checked) hideSplashIfNative('auth-already-checked');
else watch(() => auth.checked, (resolved) => { if (resolved) hideSplashIfNative('auth-checked'); });

// Failsafe: hide the splash after a generous timeout no matter what auth
// is doing. If the API call to /me hangs (CORS misconfig, server cold,
// network drop) we still want the user to see /login or the offline
// banner instead of a forever-spinner Capacitor logo.
if (isNativePlatform()) {
  setTimeout(() => hideSplashIfNative('timeout-5s'), 5000);
}

// Public routes (landing, login, register, etc.) render raw — no app chrome.
// Also hide chrome on routes that explicitly opt out (e.g. /welcome wizard).
// Anon demo sessions still get the full chrome so the demo banner renders
// and the visitor sees the same nav a real user would.
const showAppLayout = computed(
  () => (auth.user || demo.inDemo) && !route.meta.public && !route.meta.hideAppChrome,
);
</script>

<template>
  <AppLayout v-if="showAppLayout" />
  <router-view v-else />
  <UpgradeModal />
  <ForceUpdateModal />
</template>
