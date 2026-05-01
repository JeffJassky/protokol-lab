<script setup>
import { computed } from 'vue';
import { localYmd } from '../utils/date.js';

const props = defineProps({
  modelValue: { type: String, required: true },
});

const emit = defineEmits(['update:modelValue']);

const displayDate = computed(() => {
  const d = new Date(props.modelValue + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
});

function shift(days) {
  const d = new Date(props.modelValue + 'T00:00:00');
  d.setDate(d.getDate() + days);
  emit('update:modelValue', localYmd(d));
}
</script>

<template>
  <div class="date-selector">
    <button @click="shift(-1)">&larr;</button>
    <span class="date-display">{{ displayDate }}</span>
    <button @click="shift(1)">&rarr;</button>
  </div>
</template>

<style scoped>
.date-selector {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  justify-content: center;
  margin-bottom: var(--space-4);
}
.date-display {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-m);
  min-width: 120px;
  text-align: center;
  color: var(--text);
}
button {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  font-size: var(--font-size-m);
  color: var(--text-secondary);
  transition: background var(--transition-base);
}
button:hover { background: var(--bg); }
</style>
