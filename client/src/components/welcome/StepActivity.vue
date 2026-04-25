<script setup>
import { computed, watch } from 'vue';
import { ACTIVITY_LEVELS, bmrMifflin, tdee } from '../../../../shared/bodyMath.js';

const props = defineProps({
  draft: { type: Object, required: true },
});
const emit = defineEmits(['update:valid']);

const bmr = computed(() => bmrMifflin({
  sex: props.draft.sex,
  age: props.draft.age,
  heightInches: props.draft.heightInches,
  weightLbs: props.draft.currentWeightLbs,
}));

const tdeeVal = computed(() => tdee(bmr.value, props.draft.activityLevel));

// Persist BMR + TDEE onto the draft so downstream steps (and the saved
// settings doc) don't have to recompute.
watch(bmr, (v) => { props.draft.bmr = v; }, { immediate: true });
watch(tdeeVal, (v) => { props.draft.tdee = v; }, { immediate: true });

const valid = computed(() => Boolean(props.draft.activityLevel));
watch(valid, (v) => emit('update:valid', v), { immediate: true });
</script>

<template>
  <div class="step">
    <h2>How active are you?</h2>
    <p class="lede">Sets the multiplier on top of your BMR to estimate daily burn (TDEE).</p>

    <ul class="levels">
      <li v-for="lvl in ACTIVITY_LEVELS" :key="lvl.value">
        <button
          type="button"
          class="level"
          :class="{ active: draft.activityLevel === lvl.value }"
          @click="draft.activityLevel = lvl.value"
        >
          <div class="level-head">
            <span class="level-title">{{ lvl.label }}</span>
            <span class="level-mult">×{{ lvl.multiplier }}</span>
          </div>
          <span class="level-blurb">{{ lvl.blurb }}</span>
        </button>
      </li>
    </ul>

    <div v-if="bmr" class="readout">
      <div class="readout-row">
        <span class="readout-label">BMR (resting burn)</span>
        <span class="readout-val">{{ bmr.toLocaleString() }} kcal</span>
      </div>
      <div class="readout-row" :class="{ dim: !tdeeVal }">
        <span class="readout-label">TDEE (daily burn)</span>
        <span class="readout-val">{{ tdeeVal ? tdeeVal.toLocaleString() + ' kcal' : '—' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step h2 { margin: 0 0 var(--space-1); font-size: var(--font-size-xl); }
.lede { margin: 0 0 var(--space-4); color: var(--text-secondary); font-size: var(--font-size-s); }
.levels { list-style: none; padding: 0; margin: 0 0 var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.level {
  width: 100%;
  text-align: left;
  padding: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  transition: all var(--transition-fast);
  color: var(--text);
}
.level:hover { border-color: var(--text-secondary); }
.level.active {
  border-color: var(--primary);
  background: var(--primary-soft, var(--surface));
  box-shadow: 0 0 0 1px var(--primary);
}
.level-head { display: flex; justify-content: space-between; align-items: baseline; }
.level-title { font-weight: var(--font-weight-medium); font-size: var(--font-size-s); }
.level-mult { font-size: var(--font-size-xs); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.level-blurb { font-size: var(--font-size-xs); color: var(--text-secondary); }
.readout {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.readout-row { display: flex; justify-content: space-between; font-size: var(--font-size-s); }
.readout-row.dim { opacity: 0.6; }
.readout-label { color: var(--text-secondary); }
.readout-val { font-weight: var(--font-weight-medium); font-variant-numeric: tabular-nums; }
</style>
