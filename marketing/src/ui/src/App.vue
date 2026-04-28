<script setup>
import AppNav from './AppNav.vue';
</script>

<template>
  <div class="app-shell">
    <AppNav />
    <main class="main">
      <router-view />
    </main>
  </div>
</template>
