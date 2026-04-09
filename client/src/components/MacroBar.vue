<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: String,
  current: Number,
  target: Number,
  color: { type: String, default: '#4f46e5' },
  unit: { type: String, default: '' },
});

const pct = computed(() => {
  if (!props.target) return 0;
  return Math.min((props.current / props.target) * 100, 100);
});
</script>

<template>
  <div class="macro-bar">
    <div class="macro-header">
      <span class="macro-label">{{ label }}</span>
      <span class="macro-values">{{ current }} / {{ target }}{{ unit }}</span>
    </div>
    <div class="bar-track">
      <div class="bar-fill" :style="{ width: pct + '%', background: color }" />
    </div>
  </div>
</template>

<style scoped>
.macro-bar { margin-bottom: 0.6rem; }
.macro-bar:last-child { margin-bottom: 0; }
.macro-header {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  margin-bottom: 0.25rem;
}
.macro-label { font-weight: 500; color: var(--text); }
.macro-values { color: var(--text-secondary); }
.bar-track {
  height: 8px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s;
}
</style>
