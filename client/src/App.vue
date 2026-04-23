<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import AppLayout from './components/AppLayout.vue';

const auth = useAuthStore();
const route = useRoute();

// Public routes (landing, login, register, etc.) render raw — no app chrome.
const showAppLayout = computed(() => auth.user && !route.meta.public);
</script>

<template>
  <AppLayout v-if="showAppLayout" />
  <router-view v-else />
</template>
