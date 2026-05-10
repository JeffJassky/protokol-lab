<script setup>
import { computed, watch, onMounted } from 'vue';
import {
  tdee,
  calorieTargetForRate,
  defaultMacros,
} from '../../../../shared/bio/bodyMath.js';
import MacroAllocator from '../MacroAllocator.vue';

const props = defineProps({
  draft: { type: Object, required: true },
});
const emit = defineEmits(['update:valid']);

// Pre-fill calories + macros on mount if not yet set. The user can still
// edit; we only auto-fill once.
onMounted(() => {
  const tdeeVal = props.draft.tdee || tdee(props.draft.bmr, props.draft.activityLevel);
  if (!props.draft.targets) props.draft.targets = {};
  const t = props.draft.targets;
  if (!t.calories) {
    t.calories = calorieTargetForRate(tdeeVal, props.draft.goalRateLbsPerWeek) || 2000;
  }
  if (!t.proteinGrams || !t.fatGrams || !t.carbsGrams) {
    const m = defaultMacros({ calories: t.calories, weightLbs: props.draft.currentWeightLbs });
    if (!t.proteinGrams) t.proteinGrams = m.proteinGrams;
    if (!t.fatGrams) t.fatGrams = m.fatGrams;
    if (!t.carbsGrams) t.carbsGrams = m.carbsGrams;
  }
});

function resetToDefaults() {
  const tdeeVal = props.draft.tdee || tdee(props.draft.bmr, props.draft.activityLevel);
  const calories = calorieTargetForRate(tdeeVal, props.draft.goalRateLbsPerWeek) || 2000;
  const m = defaultMacros({ calories, weightLbs: props.draft.currentWeightLbs });
  props.draft.targets = { calories, ...m };
}

const valid = computed(() => {
  const t = props.draft.targets;
  if (!t) return false;
  return t.calories >= 1000 && t.proteinGrams >= 0 && t.fatGrams >= 0 && t.carbsGrams >= 0;
});
watch(valid, (v) => emit('update:valid', v), { immediate: true });
</script>

<template>
  <div class="step">
    <h2>Confirm your targets</h2>
    <p class="lede">
      Pre-filled from your inputs. Drag the bar to retune protein, fat, and carbs.
    </p>

    <label class="cal-field">
      <span class="cal-label">Daily calories</span>
      <span class="cal-input-wrap">
        <input
          type="number"
          min="1000"
          max="6000"
          step="50"
          v-model.number="draft.targets.calories"
        />
        <span class="cal-unit">kcal</span>
      </span>
    </label>

    <MacroAllocator
      v-if="draft.targets"
      :calories="draft.targets.calories || 0"
      :protein-grams="draft.targets.proteinGrams || 0"
      :fat-grams="draft.targets.fatGrams || 0"
      @update:protein-grams="draft.targets.proteinGrams = $event"
      @update:fat-grams="draft.targets.fatGrams = $event"
      @update:carbs-grams="draft.targets.carbsGrams = $event"
    />

    <button type="button" class="reset-link" @click="resetToDefaults">
      Reset to recommended
    </button>

    <p class="footnote">
      Defaults: protein ≈ 0.9 g/lb bodyweight, fat ≈ 0.35 g/lb, carbs fill the rest.
    </p>
  </div>
</template>

<style scoped>
.step h2 { margin: 0 0 var(--space-1); font-size: var(--font-size-xl); }
.lede { margin: 0 0 var(--space-4); color: var(--text-secondary); font-size: var(--font-size-s); }

.cal-field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-4); }
.cal-label { font-size: var(--font-size-s); font-weight: var(--font-weight-medium); color: var(--text); }
.cal-input-wrap { position: relative; display: flex; align-items: center; max-width: 200px; }
.cal-input-wrap input {
  width: 100%;
  padding: 0.55rem 3rem 0.55rem 0.75rem;
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-medium);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  background: var(--surface);
  color: var(--text);
}
.cal-input-wrap input:focus { outline: 2px solid var(--primary); outline-offset: -1px; }
.cal-unit {
  position: absolute;
  right: 0.75rem;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  pointer-events: none;
}

.reset-link {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  margin-top: var(--space-2);
}
.reset-link:hover { color: var(--text); }

.footnote {
  margin: var(--space-3) 0 0;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.5;
}
</style>
