<script setup>
import { computed, watch } from 'vue';

const props = defineProps({
  draft: { type: Object, required: true },
});
const emit = defineEmits(['update:valid']);

const heightFeet = computed({
  get: () => Math.floor((props.draft.heightInches || 0) / 12) || 5,
  set: (v) => {
    const inches = props.draft.heightInches ? props.draft.heightInches % 12 : 10;
    props.draft.heightInches = (Number(v) || 0) * 12 + inches;
  },
});
const heightIn = computed({
  get: () => (props.draft.heightInches || 0) % 12,
  set: (v) => {
    const feet = Math.floor((props.draft.heightInches || 0) / 12) || 5;
    props.draft.heightInches = feet * 12 + (Number(v) || 0);
  },
});

const valid = computed(() => {
  const d = props.draft;
  return (
    (d.sex === 'male' || d.sex === 'female') &&
    d.age >= 13 && d.age <= 120 &&
    d.heightInches >= 36 && d.heightInches <= 96 &&
    d.currentWeightLbs >= 50 && d.currentWeightLbs <= 700
  );
});
watch(valid, (v) => emit('update:valid', v), { immediate: true });
</script>

<template>
  <div class="step">
    <h2>About you</h2>
    <p class="lede">A few basics so we can size your calorie + protein targets.</p>

    <div class="field">
      <span class="label">Sex</span>
      <div class="seg">
        <button
          type="button"
          class="seg-btn"
          :class="{ active: draft.sex === 'male' }"
          @click="draft.sex = 'male'"
        >Male</button>
        <button
          type="button"
          class="seg-btn"
          :class="{ active: draft.sex === 'female' }"
          @click="draft.sex = 'female'"
        >Female</button>
      </div>
      <p class="hint">Used for the BMR formula. We don't share this anywhere.</p>
    </div>

    <div class="row">
      <label class="field">
        <span class="label">Age</span>
        <input type="number" min="13" max="120" v-model.number="draft.age" />
      </label>
      <label class="field">
        <span class="label">Current weight</span>
        <span class="suffix-wrap">
          <input type="number" min="50" max="700" step="0.1" v-model.number="draft.currentWeightLbs" />
          <span class="suffix">lbs</span>
        </span>
      </label>
    </div>

    <div class="field">
      <span class="label">Height</span>
      <div class="row narrow">
        <span class="suffix-wrap">
          <input type="number" min="3" max="8" v-model.number="heightFeet" />
          <span class="suffix">ft</span>
        </span>
        <span class="suffix-wrap">
          <input type="number" min="0" max="11" v-model.number="heightIn" />
          <span class="suffix">in</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.step h2 { margin: 0 0 var(--space-1); font-size: var(--font-size-xl); }
.lede { margin: 0 0 var(--space-4); color: var(--text-secondary); font-size: var(--font-size-s); }
.field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-3); }
.label { font-size: var(--font-size-s); font-weight: var(--font-weight-medium); color: var(--text); }
.hint { margin: var(--space-1) 0 0; font-size: var(--font-size-xs); color: var(--text-secondary); }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.row.narrow { grid-template-columns: 110px 110px; }
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
.seg { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
.seg-btn {
  padding: 0.65rem;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: var(--radius-small);
  cursor: pointer;
  font-size: var(--font-size-s);
  transition: all var(--transition-fast);
}
.seg-btn.active {
  border-color: var(--primary);
  background: var(--primary-soft, var(--primary));
  color: var(--primary);
  font-weight: var(--font-weight-medium);
}
</style>
