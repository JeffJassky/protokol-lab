<script setup>
import { useAuthStore } from './stores/auth.js';
import AppLayout from './components/AppLayout.vue';

const auth = useAuthStore();
</script>

<template>
  <AppLayout v-if="auth.user" />
  <router-view v-else />
</template>
