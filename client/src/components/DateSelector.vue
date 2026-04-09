<script setup>
import { computed } from 'vue';

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
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
});

function shift(days) {
  const d = new Date(props.modelValue + 'T00:00:00');
  d.setDate(d.getDate() + days);
  emit('update:modelValue', d.toISOString().slice(0, 10));
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
  gap: 0.75rem;
  justify-content: center;
  margin-bottom: 1rem;
}
.date-display {
  font-weight: 600;
  font-size: 1rem;
  min-width: 120px;
  text-align: center;
  color: var(--text);
}
button {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.3rem 0.65rem;
  cursor: pointer;
  font-size: 0.95rem;
  color: var(--text-secondary);
  transition: background 0.15s;
}
button:hover { background: var(--bg); }
</style>
