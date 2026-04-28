<script setup>
defineProps({
  title: { type: String, required: true },
  sub: { type: String, default: '' },
});
</script>

<template>
  <div>
    <h1 class="page-title">{{ title }}</h1>
    <p class="page-sub">{{ sub }}</p>
    <div class="card">
      <p class="empty-state">This module isn't built yet. See <code>marketing/PLAN.md</code> for the phase plan.</p>
    </div>
  </div>
</template>
