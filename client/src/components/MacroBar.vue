<script setup>
import { computed } from 'vue';

const props = defineProps({
  label: String,
  current: Number,
  target: Number,
  color: { type: String, default: 'var(--color-cal)' },
  unit: { type: String, default: '' },
  // Shared max ratio across a group of bars. When > 1, the track represents
  // 0 → scaleMax × target, and overage (the portion beyond target) is drawn
  // in red. Default 1 = track represents 0 → target, no overage shown.
  scaleMax: { type: Number, default: 1 },
});

const ratio = computed(() => {
  if (!props.target) return 0;
  return props.current / props.target;
});

// Width (% of track) up to but not beyond the target line.
const normalWidth = computed(() => {
  const r = Math.min(ratio.value, 1);
  return (r / props.scaleMax) * 100;
});

// Width (% of track) of the over-target portion.
const overWidth = computed(() => {
  const over = Math.max(0, ratio.value - 1);
  return (over / props.scaleMax) * 100;
});

// Position of the target line on the track (as a % from the left). Only
// visible when scaleMax > 1 so the line meaningfully indicates where 100% is.
const targetLinePct = computed(() => (1 / props.scaleMax) * 100);
const showTargetLine = computed(() => props.scaleMax > 1);
</script>

<template>
  <div class="macro-bar">
    <div class="macro-header">
      <span class="macro-label">{{ label }}</span>
      <span class="macro-values"><span class="macro-current">{{ Math.round(current).toLocaleString() }}</span><span class="macro-budget"> / {{ Math.round(target).toLocaleString() }}{{ unit }}</span></span>
    </div>
    <div class="bar-track">
      <div class="bar-fill" :style="{ width: normalWidth + '%', background: color }" />
      <div v-if="overWidth > 0" class="bar-over" :style="{ left: normalWidth + '%', width: overWidth + '%' }" />
      <div v-if="showTargetLine" class="target-line" :style="{ left: targetLinePct + '%' }" />
    </div>
  </div>
</template>

<style scoped>
.macro-bar { margin-bottom: var(--space-2); }
.macro-bar:last-child { margin-bottom: 0; }
.macro-header {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-size-xs);
  margin-bottom: var(--space-1);
}
.macro-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-secondary);
  font-weight: var(--font-weight-bold);
  line-height: 1;
}
.macro-values { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.macro-current { font-weight: var(--font-weight-bold); color: var(--text); }
.macro-budget { color: var(--text-tertiary); }
.bar-track {
  position: relative;
  height: 8px;
  background: var(--border);
  border-radius: var(--radius-small);
  overflow: hidden;
}
.bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: var(--radius-small);
  transition: width 0.3s;
}
.bar-over {
  position: absolute;
  top: 0;
  height: 100%;
  background: var(--danger);
  border-radius: var(--radius-small);
  transition: left 0.3s, width 0.3s;
}
.target-line {
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 1px;
  background: var(--track-target-line);
  box-shadow: 0 0 0 0.5px var(--track-target-halo);
  pointer-events: none;
}
</style>
