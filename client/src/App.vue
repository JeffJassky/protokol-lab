<script setup>
import { useAuthStore } from './stores/auth.js';
import { useFonts } from './composables/useFonts.js';
import AppLayout from './components/AppLayout.vue';

const auth = useAuthStore();
useFonts(); // bootstrap font loader (persists across routes)
</script>

<template>
  <AppLayout v-if="auth.user" />
  <router-view v-else />
</template>
