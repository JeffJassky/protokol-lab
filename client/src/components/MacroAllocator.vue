<script setup>
import { computed, ref, watch } from 'vue';

// Visual macro allocator: a single horizontal bar with two draggable handles.
//   Handle 1 = protein|fat boundary
//   Handle 2 = fat|carbs boundary
// Carbs is auto-derived as whatever calories are left after protein + fat.
// The carbs grams value is emitted via `update:carbsGrams` so the parent can
// persist the full set without recomputing.

const props = defineProps({
  calories: { type: Number, required: true },
  proteinGrams: { type: Number, required: true },
  fatGrams: { type: Number, required: true },
});

const emit = defineEmits(['update:proteinGrams', 'update:fatGrams', 'update:carbsGrams']);

const proteinKcal = computed(() => props.proteinGrams * 4);
const fatKcal = computed(() => props.fatGrams * 9);
const remainingAfterProtein = computed(() => Math.max(0, props.calories - proteinKcal.value));
const carbsKcal = computed(() => Math.max(0, remainingAfterProtein.value - fatKcal.value));
const carbsComputed = computed(() => Math.round(carbsKcal.value / 4));

const maxProteinGrams = computed(() => Math.floor(props.calories / 4));
const maxFatGrams = computed(() => Math.floor(remainingAfterProtein.value / 9));

const pctProtein = computed(() => (props.calories ? (proteinKcal.value / props.calories) * 100 : 0));
const pctFat = computed(() => (props.calories ? (fatKcal.value / props.calories) * 100 : 0));
const pctCarbs = computed(() => Math.max(0, 100 - pctProtein.value - pctFat.value));

// Keep carbs in sync with parent. Emits whenever the derived value changes —
// including on initial mount so the parent gets the first computed value.
watch(carbsComputed, (v) => emit('update:carbsGrams', v), { immediate: true });

// Clamp protein/fat if calories shrinks below current allocation.
watch(() => props.calories, () => {
  if (props.proteinGrams > maxProteinGrams.value) {
    emit('update:proteinGrams', maxProteinGrams.value);
  }
  if (props.fatGrams > maxFatGrams.value) {
    emit('update:fatGrams', maxFatGrams.value);
  }
});
watch(() => props.proteinGrams, () => {
  if (props.fatGrams > maxFatGrams.value) {
    emit('update:fatGrams', maxFatGrams.value);
  }
});

const barRef = ref(null);
let activeHandle = null;

function pxToKcal(clientX) {
  const rect = barRef.value.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  return pct * props.calories;
}

function onDown(e) {
  const target = e.target.closest('.handle');
  if (!target) return;
  activeHandle = target.dataset.handle;
  const onMove = (ev) => {
    const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const kcalPos = pxToKcal(clientX);

    if (activeHandle === '1') {
      // Protein|fat boundary. Can't pass handle 2.
      const maxKcal = props.calories - fatKcal.value;
      const clamped = Math.max(0, Math.min(maxKcal, kcalPos));
      emit('update:proteinGrams', Math.round(clamped / 4));
    } else {
      // Fat|carbs boundary. Must stay right of handle 1.
      const minKcal = proteinKcal.value;
      const clamped = Math.max(minKcal, Math.min(props.calories, kcalPos));
      const fatKcalNew = clamped - proteinKcal.value;
      emit('update:fatGrams', Math.round(fatKcalNew / 9));
    }
  };
  const onUp = () => {
    activeHandle = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onUp);
}

function setProtein(v) {
  emit('update:proteinGrams', Math.min(Number(v) || 0, maxProteinGrams.value));
}
function setFat(v) {
  emit('update:fatGrams', Math.min(Number(v) || 0, maxFatGrams.value));
}
</script>

<template>
  <div class="alloc">
    <div
      class="alloc-bar"
      ref="barRef"
      @mousedown="onDown"
      @touchstart.prevent="onDown"
    >
      <div class="seg seg-p" :style="{ width: pctProtein + '%' }" />
      <div class="seg seg-f" :style="{ width: pctFat + '%' }" />
      <div class="seg seg-c" :style="{ width: pctCarbs + '%' }" />
      <div class="handle handle-1" :style="{ left: pctProtein + '%' }" data-handle="1" />
      <div class="handle handle-2" :style="{ left: (pctProtein + pctFat) + '%' }" data-handle="2" />
    </div>

    <div class="alloc-legend">
      <div class="alloc-legend-item">
        <span class="legend-dot dot-p"></span>
        <span class="alloc-label label-p">Protein</span>
        <span class="alloc-spacer"></span>
        <input
          type="number"
          class="alloc-input"
          :value="proteinGrams"
          min="0"
          :max="maxProteinGrams"
          step="5"
          @change="setProtein($event.target.value)"
        /><span class="alloc-unit">g</span>
        <span class="alloc-detail">{{ proteinKcal }} kcal · {{ Math.round(pctProtein) }}%</span>
      </div>
      <div class="alloc-legend-item">
        <span class="legend-dot dot-f"></span>
        <span class="alloc-label label-f">Fat</span>
        <span class="alloc-spacer"></span>
        <input
          type="number"
          class="alloc-input"
          :value="fatGrams"
          min="0"
          :max="maxFatGrams"
          step="1"
          @change="setFat($event.target.value)"
        /><span class="alloc-unit">g</span>
        <span class="alloc-detail">{{ fatKcal }} kcal · {{ Math.round(pctFat) }}%</span>
      </div>
      <div class="alloc-legend-item">
        <span class="legend-dot dot-c"></span>
        <span class="alloc-label label-c">Carbs</span>
        <span class="alloc-spacer"></span>
        <span class="alloc-computed">{{ carbsComputed }}</span><span class="alloc-unit">g</span>
        <span class="alloc-detail">{{ carbsKcal }} kcal · {{ Math.round(pctCarbs) }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.alloc { width: 100%; }

.alloc-bar {
  position: relative;
  display: flex;
  height: 32px;
  border-radius: var(--radius-small);
  overflow: visible;
  margin-bottom: 1rem;
  border: 1px solid var(--border);
  cursor: default;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.seg {
  height: 100%;
  min-width: 0;
  transition: width 0.05s;
}
.seg-p { background: var(--color-protein, #6366f1); }
.seg-f { background: var(--color-fat, #f59e0b); }
.seg-c { background: var(--color-carbs, #14b8a6); }

.handle {
  position: absolute;
  top: 50%;
  width: 6px;
  height: 40px;
  margin-left: -3px;
  margin-top: -20px;
  background: var(--surface);
  border: 2px solid var(--border-strong, var(--text-secondary));
  border-radius: var(--radius-small);
  cursor: ew-resize;
  z-index: 2;
  box-shadow: var(--shadow-s);
  transition: border-color var(--transition-fast);
}
.handle:hover { border-color: var(--text-secondary); }

.alloc-legend { margin-bottom: 0.5rem; }
.alloc-legend-item {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin-bottom: 0.3rem;
}
.legend-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  position: relative;
  top: -1px;
}
.dot-p { background: var(--color-protein, #6366f1); }
.dot-f { background: var(--color-fat, #f59e0b); }
.dot-c { background: var(--color-carbs, #14b8a6); }
.alloc-label { font-size: var(--font-size-s); font-weight: var(--font-weight-bold); }
.label-p { color: var(--color-protein, #6366f1); }
.label-f { color: var(--color-fat, #f59e0b); }
.label-c { color: var(--color-carbs, #14b8a6); }
.alloc-spacer { flex: 1; }
.alloc-input {
  width: 52px;
  padding: 0.2rem 0.35rem;
  font-size: var(--font-size-s);
  text-align: right;
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
  border-radius: var(--radius-small);
}
.alloc-unit {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}
.alloc-computed {
  display: inline-block;
  width: 52px;
  text-align: right;
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.alloc-detail {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
</style>
