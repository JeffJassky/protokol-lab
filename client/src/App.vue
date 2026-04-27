<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import { useDemoStore } from './stores/demo.js';
import { useUpgradeModalStore } from './stores/upgradeModal.js';
import { registerPlanLimitHandler } from './api/index.js';
import { useTheme } from './composables/useTheme.js';
import AppLayout from './components/AppLayout.vue';
import UpgradeModal from './components/UpgradeModal.vue';

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
</template>
