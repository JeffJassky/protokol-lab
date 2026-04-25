<script setup>
import { computed } from 'vue';

/**
 * "Protokol [LAB]" wordmark. Sizes scale proportionally from a single
 * `size` prop (text font-size in px). The LAB badge auto-hides below
 * `labMinSize` to stay legible at small scales.
 */
const props = defineProps({
  size: { type: [Number, String], default: 18 },
  color: { type: String, default: 'currentColor' },
  showLab: { type: Boolean, default: true },
  labMinSize: { type: Number, default: 14 },
});

const sizePx = computed(() => {
  const n = typeof props.size === 'number' ? props.size : parseFloat(props.size);
  return Number.isFinite(n) ? n : 18;
});

const labVisible = computed(() => props.showLab && sizePx.value >= props.labMinSize);

const wordStyle = computed(() => ({
  fontSize: `${sizePx.value}px`,
  color: props.color,
}));

// LAB badge proportions derived from logo.html spec at size 36:
//   font-size 11px (≈30% of name size), padding 3×8px, border 1px, gap 12px.
const labStyle = computed(() => {
  const s = sizePx.value;
  return {
    fontSize: `${Math.max(8, s * 0.31).toFixed(2)}px`,
    padding: `${(s * 0.085).toFixed(2)}px ${(s * 0.22).toFixed(2)}px`,
    borderColor: 'currentColor',
    color: props.color,
  };
});

const gapStyle = computed(() => ({
  gap: `${(sizePx.value * 0.33).toFixed(2)}px`,
}));
</script>

<template>
  <span class="brand-wordmark" :style="gapStyle">
    <span class="wm-name" :style="wordStyle">Protokol</span>
    <span v-if="labVisible" class="wm-lab" :style="labStyle">LAB</span>
  </span>
</template>

<style scoped>
.brand-wordmark {
  display: inline-flex;
  align-items: baseline;
  font-family: var(--font-mono, "JetBrains Mono", ui-monospace, monospace);
  line-height: 1;
}
.wm-name {
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
}
.wm-lab {
  font-weight: 600;
  letter-spacing: 0.2em;
  line-height: 1;
  border: 1px solid currentColor;
  text-transform: uppercase;
  white-space: nowrap;
  align-self: center;
}
</style>
