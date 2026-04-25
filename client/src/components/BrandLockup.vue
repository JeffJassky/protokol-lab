<script setup>
import { computed } from 'vue';
import BrandIcon from './BrandIcon.vue';
import BrandWordmark from './BrandWordmark.vue';

/**
 * Icon + wordmark side-by-side. `size` drives the wordmark text size
 * in px; the icon scales to match (icon edge ≈ 1.6× text size, which
 * matches the cap-height proportion of the outlined PK glyph).
 *
 * Hide the wordmark with `showWordmark={false}` for icon-only layouts
 * (e.g. mobile nav). Hide the icon with `showIcon={false}` for text-
 * only contexts.
 */
const props = defineProps({
  size: { type: [Number, String], default: 18 },
  color: { type: String, default: 'currentColor' },
  showIcon: { type: Boolean, default: true },
  showWordmark: { type: Boolean, default: true },
  showLab: { type: Boolean, default: true },
  labMinSize: { type: Number, default: 14 },
  iconScale: { type: Number, default: 1.6 },
  title: { type: String, default: 'Protokol Lab' },
});

const sizePx = computed(() => {
  const n = typeof props.size === 'number' ? props.size : parseFloat(props.size);
  return Number.isFinite(n) ? n : 18;
});

const iconSize = computed(() => Math.round(sizePx.value * props.iconScale));
const gapStyle = computed(() => ({
  gap: `${(sizePx.value * 0.5).toFixed(2)}px`,
  color: props.color,
}));
</script>

<template>
  <span class="brand-lockup" :style="gapStyle" :aria-label="title">
    <BrandIcon
      v-if="showIcon"
      :size="iconSize"
      :color="color"
      :title="title"
    />
    <BrandWordmark
      v-if="showWordmark"
      :size="sizePx"
      :color="color"
      :show-lab="showLab"
      :lab-min-size="labMinSize"
    />
  </span>
</template>

<style scoped>
.brand-lockup {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}
</style>
