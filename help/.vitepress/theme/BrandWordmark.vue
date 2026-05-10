<script setup>
// Mirrors client/src/components/BrandWordmark.vue. Static size for
// nav use — proportional padding/gap derived from the same ratios so
// the LAB pill matches the app's wordmark exactly.
const SIZE = 17;
const labFontSize = Math.max(8, SIZE * 0.31).toFixed(2);
const labPadY = (SIZE * 0.085).toFixed(2);
const labPadX = (SIZE * 0.22).toFixed(2);
const gap = (SIZE * 0.33).toFixed(2);
</script>

<template>
  <span class="brand-wordmark" :style="{ gap: `${gap}px` }">
    <span class="wm-name" :style="{ fontSize: `${SIZE}px` }">Protokol</span>
    <span
      class="wm-lab"
      :style="{ fontSize: `${labFontSize}px`, padding: `${labPadY}px ${labPadX}px` }"
    >LAB</span>
    <span class="wm-suffix">Help</span>
  </span>
</template>

<style scoped>
.brand-wordmark {
  display: inline-flex;
  align-items: baseline;
  font-family: var(--vp-font-family-mono);
  line-height: 1;
  color: var(--vp-c-text-1);
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
  border-radius: 0;
}
/* Subtle "Help" tag to disambiguate from the main app wordmark */
.wm-suffix {
  font-family: var(--vp-font-family-mono);
  font-size: 0.78em;
  font-weight: 500;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-3);
  margin-left: 2px;
  align-self: center;
}
</style>
