<script setup>
import { computed } from 'vue';
import { PK_PATH, PK_VIEWBOX } from '../brand/pk-glyph.js';

const props = defineProps({
  size: { type: [Number, String], default: 24 },
  color: { type: String, default: 'currentColor' },
  title: { type: String, default: 'Protokol Lab' },
});

const px = computed(() =>
  typeof props.size === 'number' ? `${props.size}px` : props.size,
);
</script>

<template>
  <svg
    class="brand-icon"
    :viewBox="PK_VIEWBOX"
    :width="px"
    :height="px"
    role="img"
    :aria-label="title"
    xmlns="http://www.w3.org/2000/svg"
  >
    <title>{{ title }}</title>
    <path :d="PK_PATH" :fill="color" />
  </svg>
</template>

<style scoped>
.brand-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
