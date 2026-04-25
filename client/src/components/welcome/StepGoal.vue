<script setup>
import { computed, watch } from 'vue';
import { GOAL_RATES, etaToGoal, tdee, calorieTargetForRate } from '../../../../shared/bodyMath.js';

const props = defineProps({
  draft: { type: Object, required: true },
});
const emit = defineEmits(['update:valid']);

const tdeeVal = computed(() => tdee(props.draft.bmr, props.draft.activityLevel));

const calorieTarget = computed(() =>
  calorieTargetForRate(tdeeVal.value, props.draft.goalRateLbsPerWeek),
);

const eta = computed(() =>
  etaToGoal({
    currentWeightLbs: props.draft.currentWeightLbs,
    goalWeightLbs: props.draft.goalWeightLbs,
    rateLbsPerWeek: props.draft.goalRateLbsPerWeek,
  }),
);

const etaLabel = computed(() => {
  const e = eta.value;
  if (e == null) return null;
  if (e.weeks === 0) return 'Already at goal';
  if (e.days < 30) return `${Math.round(e.days)} days`;
  if (e.weeks < 12) return `${e.weeks.toFixed(1)} weeks`;
  return `${(e.weeks / (52 / 12)).toFixed(1)} months`;
});

const goalDate = computed(() => {
  const e = eta.value;
  if (!e || e.weeks === 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + Math.round(e.days));
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
});

const wrongDirection = computed(() => {
  const cur = props.draft.currentWeightLbs;
  const goal = props.draft.goalWeightLbs;
  const rate = props.draft.goalRateLbsPerWeek;
  if (!cur || !goal || rate == null) return false;
  if (Math.abs(cur - goal) < 0.1) return false;
  const needLoss = cur > goal;
  const losing = rate < 0;
  if (rate === 0) return false;
  return needLoss !== losing;
});

const valid = computed(() => {
  return (
    props.draft.goalWeightLbs >= 50 &&
    props.draft.goalWeightLbs <= 700 &&
    props.draft.goalRateLbsPerWeek != null &&
    !wrongDirection.value
  );
});
watch(valid, (v) => emit('update:valid', v), { immediate: true });
</script>

<template>
  <div class="step">
    <h2>What's your goal?</h2>
    <p class="lede">A 1 lb/week change ≈ 500 kcal/day deficit or surplus.</p>

    <label class="field">
      <span class="label">Goal weight</span>
      <span class="suffix-wrap">
        <input type="number" min="50" max="700" step="0.1" v-model.number="draft.goalWeightLbs" />
        <span class="suffix">lbs</span>
      </span>
    </label>

    <span class="label">Rate</span>
    <ul class="rates">
      <li v-for="r in GOAL_RATES" :key="r.value">
        <button
          type="button"
          class="rate"
          :class="{ active: draft.goalRateLbsPerWeek === r.value }"
          @click="draft.goalRateLbsPerWeek = r.value"
        >
          <span class="rate-label">{{ r.label }}</span>
          <span class="rate-note">{{ r.note }}</span>
        </button>
      </li>
    </ul>

    <div v-if="wrongDirection" class="warn">
      That rate moves you away from your goal. Pick a {{ draft.currentWeightLbs > draft.goalWeightLbs ? 'lose' : 'gain' }} option.
    </div>

    <div v-else-if="calorieTarget && etaLabel" class="readout">
      <div class="readout-row">
        <span class="readout-label">Calorie target</span>
        <span class="readout-val">{{ calorieTarget.toLocaleString() }} kcal/day</span>
      </div>
      <div class="readout-row">
        <span class="readout-label">Hit goal in</span>
        <span class="readout-val">{{ etaLabel }}<span v-if="goalDate" class="readout-sub"> · {{ goalDate }}</span></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step h2 { margin: 0 0 var(--space-1); font-size: var(--font-size-xl); }
.lede { margin: 0 0 var(--space-4); color: var(--text-secondary); font-size: var(--font-size-s); }
.field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-3); max-width: 200px; }
.label { font-size: var(--font-size-s); font-weight: var(--font-weight-medium); color: var(--text); display: block; margin-bottom: var(--space-2); }
input[type="number"] {
  width: 100%;
  padding: 0.55rem 0.75rem;
  font-size: var(--font-size-m);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  background: var(--surface);
  color: var(--text);
}
input[type="number"]:focus { outline: 2px solid var(--primary); outline-offset: -1px; }
.suffix-wrap { position: relative; display: flex; align-items: center; }
.suffix-wrap input { padding-right: 2.5rem; }
.suffix {
  position: absolute;
  right: 0.75rem;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  pointer-events: none;
}
.rates { list-style: none; padding: 0; margin: 0 0 var(--space-3); display: flex; flex-direction: column; gap: var(--space-1); }
.rate {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  text-align: left;
  padding: var(--space-2) var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  cursor: pointer;
  font-size: var(--font-size-s);
  color: var(--text);
  transition: all var(--transition-fast);
}
.rate:hover { border-color: var(--text-secondary); }
.rate.active {
  border-color: var(--primary);
  background: var(--primary-soft, var(--surface));
  box-shadow: 0 0 0 1px var(--primary);
}
.rate-label { font-weight: var(--font-weight-medium); }
.rate-note { font-size: var(--font-size-xs); color: var(--text-secondary); }
.warn {
  background: var(--warning-soft, var(--surface));
  border: 1px solid var(--warning, var(--border));
  color: var(--warning, var(--text));
  border-radius: var(--radius-small);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-s);
}
.readout {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.readout-row { display: flex; justify-content: space-between; font-size: var(--font-size-s); gap: var(--space-2); }
.readout-label { color: var(--text-secondary); }
.readout-val { font-weight: var(--font-weight-medium); font-variant-numeric: tabular-nums; text-align: right; }
.readout-sub { font-weight: var(--font-weight-regular); color: var(--text-secondary); margin-left: var(--space-1); }
</style>
