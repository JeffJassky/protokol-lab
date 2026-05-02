<script setup>
import { computed } from 'vue';
import MacroBar from './MacroBar.vue';
import { computeNutritionScore } from '../utils/nutritionScore.js';

const props = defineProps({
  summary: { type: Object, required: true },
});

// Aggregated nutrition for the day. The summary endpoint returns a perServing
// subdoc keyed by canonical nutrient names; we only read macros here.
const totals = computed(() => {
  const ps = props.summary?.perServing || {};
  return {
    calories: ps.calories || 0,
    protein: ps.protein || 0,
    fat: ps.fat || 0,
    carbs: ps.carbs || 0,
  };
});

// Shared bar scale across all four macros. When any macro goes over its
// target the whole group rescales so the most-exceeded one fits at the right
// edge of the track, and every other bar grows proportionally. Under-target
// days leave this at 1.
const scaleMax = computed(() => {
  const s = props.summary;
  if (!s || !s.targets) return 1;
  const t = totals.value;
  const ratios = [
    s.targets.calories ? t.calories / s.targets.calories : 0,
    s.targets.proteinGrams ? t.protein / s.targets.proteinGrams : 0,
    s.targets.fatGrams ? t.fat / s.targets.fatGrams : 0,
    s.targets.carbsGrams ? t.carbs / s.targets.carbsGrams : 0,
  ];
  return Math.max(1, ...ratios);
});

const scoreDetail = computed(() => {
  if (!props.summary?.targets) return null;
  const value = computeNutritionScore(totals.value, props.summary.targets);
  return value != null ? { value } : null;
});

const scoreBand = computed(() => {
  const v = scoreDetail.value?.value;
  if (v == null) return 'none';
  if (v >= 85) return 'good';
  if (v >= 60) return 'ok';
  return 'bad';
});

// Actionable guidance: given the current state, compute what the user should
// do next. The most useful case is the classic weight-loss rebalance where
// calories are over AND protein is under — in that case you can't just "add
// protein" without blowing calories further, so we compute the fat-for-protein
// trade that would satisfy both constraints simultaneously.
//
// Tolerances prevent us from nagging about 5-calorie overshoots.
const TOL_CAL = 50;
const TOL_PRO = 10;
const TOL_FAT = 5;

const suggestion = computed(() => {
  const s = props.summary;
  if (!s || !s.targets) return null;
  const t = s.targets;
  const cur = totals.value;

  const calDelta = cur.calories - (t.calories || 0); // + = over
  const proDelta = cur.protein - (t.proteinGrams || 0); // - = under
  const fatDelta = cur.fat - (t.fatGrams || 0); // + = over

  // All primary macros within tolerance.
  if (Math.abs(calDelta) <= TOL_CAL && proDelta >= -TOL_PRO && fatDelta <= TOL_FAT) {
    return {
      tone: 'good',
      headline: "You're on track",
      detail: null,
    };
  }

  // Weight-loss classic: under protein AND over calories. Compute the
  // fat-for-protein trade that hits both targets simultaneously.
  //   Add P grams protein  → +4P kcal
  //   Cut F grams fat      → −9F kcal
  //   Want: +4P − 9F = −calDelta  (net calorie change equals the overage)
  //   And:  P = |proDelta|      (close the protein gap exactly)
  //   ⇒  F = (calDelta + 4P) / 9
  if (proDelta < -TOL_PRO && calDelta > TOL_CAL) {
    const proToAdd = Math.round(-proDelta);
    const fatToCut = Math.round((calDelta + 4 * proToAdd) / 9);
    if (fatToCut > 0) {
      return {
        tone: 'fix',
        headline: `Add ${proToAdd}g protein, cut ${fatToCut}g fat`,
        detail: 'Swap fat for lean protein — chicken breast, egg whites, or a protein shake — to hit both targets without blowing calories.',
      };
    }
  }

  // Under protein but calories OK or under — just eat more protein.
  if (proDelta < -TOL_PRO) {
    const calLeft = Math.max(0, -calDelta);
    const need = Math.round(-proDelta);
    return {
      tone: 'fix',
      headline: `Need ${need}g more protein`,
      detail: calLeft > 0
        ? `You have ~${calLeft} kcal left today — use them for lean protein.`
        : 'Prioritize a protein-rich food next.',
    };
  }

  // Over calories + protein already hit → just cut calories (usually fat or carbs).
  if (calDelta > TOL_CAL) {
    return {
      tone: 'fix',
      headline: `${calDelta} kcal over target`,
      detail: fatDelta > TOL_FAT
        ? `Fat is ${Math.round(fatDelta)}g over — avoid oils and fatty foods for the rest of the day.`
        : 'Stop eating for the day, or pick lower-calorie options.',
    };
  }

  // Under calories with protein hit — room to eat more.
  if (calDelta < -TOL_CAL) {
    return {
      tone: 'ok',
      headline: `${-calDelta} kcal left for today`,
      detail: 'Macros look good — eat more of anything you want.',
    };
  }

  // Over fat only, calories OK.
  if (fatDelta > TOL_FAT) {
    return {
      tone: 'fix',
      headline: `Fat is ${Math.round(fatDelta)}g over`,
      detail: 'Calories are on target but fat is high — be careful with oils and fatty foods.',
    };
  }

  return null;
});
</script>

<template>
  <div v-if="summary" class="daily-summary">
    <div v-if="suggestion || scoreDetail" class="advice-block">
      <div v-if="scoreDetail" class="score-pill" :class="`band-${scoreBand}`">
        <span class="score-value">{{ scoreDetail.value }}</span>
        <span class="score-suffix">/100</span>
      </div>
      <div v-if="suggestion" class="suggestion" :class="`tone-${suggestion.tone}`">
        <div class="suggestion-headline">{{ suggestion.headline }}</div>
        <div v-if="suggestion.detail" class="suggestion-detail">{{ suggestion.detail }}</div>
      </div>
    </div>
    <MacroBar :index="0" label="Calories" :current="totals.calories" :target="summary.targets?.calories || 0" color="var(--color-cal)" unit=" kcal" :scale-max="scaleMax" />
    <MacroBar :index="1" label="Protein" :current="totals.protein" :target="summary.targets?.proteinGrams || 0" color="var(--color-protein)" unit="g" :scale-max="scaleMax" />
    <MacroBar :index="2" label="Fat" :current="totals.fat" :target="summary.targets?.fatGrams || 0" color="var(--color-fat)" unit="g" :scale-max="scaleMax" />
    <MacroBar :index="3" label="Carbs" :current="totals.carbs" :target="summary.targets?.carbsGrams || 0" color="var(--color-carbs)" unit="g" :scale-max="scaleMax" />
  </div>
</template>

<style scoped>
.daily-summary {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-3) var(--space-4);
}

.advice-block {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--border);
}
.score-pill {
  display: inline-flex;
  align-items: baseline;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
  color: white;
  flex-shrink: 0;
}
.score-value { font-size: var(--font-size-m); font-weight: var(--font-weight-bold); line-height: 1; }
.score-suffix { font-size: var(--font-size-xs); margin-left: 0.12rem; opacity: 0.85; }
.band-good { background: var(--success); }
.band-ok { background: var(--warning); }
.band-bad { background: var(--danger); }
.band-none { background: var(--border); color: var(--text-secondary); }

.suggestion { flex: 1; min-width: 0; }
.suggestion-headline {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  line-height: 1.25;
}
.suggestion-detail {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.35;
  margin-top: var(--space-1);
}
.tone-good .suggestion-headline { color: var(--success); }
.tone-fix .suggestion-headline { color: var(--text); }
.tone-ok .suggestion-headline { color: var(--text); }
</style>
