<script setup>
import { ref, computed } from 'vue';
import { useWeeklyBudget } from '../composables/useWeeklyBudget.js';
import MacroBar from './MacroBar.vue';

const props = defineProps({
  defaultExpanded: { type: Boolean, default: false },
});

const { targets, weekTarget, perDay, consumed, delta, adjustedToday } = useWeeklyBudget();
const expanded = ref(props.defaultExpanded);

function r(n) { return Math.round(n); }
function fmt(n) { return Math.round(n).toLocaleString(); }

function deltaLabel(v, unit) {
  if (v == null) return '';
  const n = Math.round(v);
  if (n === 0) return `on target`;
  return n > 0 ? `${n.toLocaleString()}${unit} left` : `${(-n).toLocaleString()}${unit} over`;
}

function deltaClass(v) {
  if (v == null) return '';
  return v < 0 ? 'over' : v > 0 ? 'under' : 'neutral';
}

function dayShortLabel(iso, isToday) {
  if (isToday) return 'Today';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short' });
}

const calDelta = computed(() => delta.value?.calories);
const calAdjusted = computed(() => adjustedToday.value?.calories);
const calToday = computed(() => perDay.value[6]?.calories ?? 0);
const todayOver = computed(() => calToday.value > (calAdjusted.value ?? 0));

// Shared scale across the 4 weekly MacroBars so overage is drawn as red
// continuation past a target line — mirrors DailySummary's behavior.
const weekScaleMax = computed(() => {
  const w = weekTarget.value;
  const c = consumed.value;
  if (!w) return 1;
  const ratios = [
    w.calories ? c.calories / w.calories : 0,
    w.protein ? c.protein / w.protein : 0,
    w.fat ? c.fat / w.fat : 0,
    w.carbs ? c.carbs / w.carbs : 0,
  ];
  return Math.max(1, ...ratios);
});

// Vertical bar height scaled to the largest single-day intake in the window,
// so every bar is readable even when days are wildly different.
const maxDayCal = computed(() => {
  const vals = perDay.value.map((d) => d.calories);
  return Math.max(targets.value?.calories || 0, ...vals, 1);
});

function barHeightPct(cal) {
  return (cal / maxDayCal.value) * 100;
}

// Daily target line as % height inside the bar track.
const targetLinePct = computed(() => {
  if (!targets.value?.calories) return 0;
  return (targets.value.calories / maxDayCal.value) * 100;
});
</script>

<template>
  <div v-if="targets && weekTarget" class="weekly-budget">
    <button
      type="button"
      class="wb-header"
      :class="{ expanded }"
      @click="expanded = !expanded"
    >
      <span class="wb-title">Week</span>
      <span class="wb-value" :class="deltaClass(calDelta)">
        {{ deltaLabel(calDelta, ' kcal') }}
      </span>
      <span class="wb-sep">·</span>
      <span class="wb-title">Today</span>
      <span class="wb-value" :class="todayOver ? 'over' : ''">
        {{ fmt(calToday) }} / {{ fmt(calAdjusted) }} kcal
      </span>
      <span class="wb-caret">{{ expanded ? '▾' : '▸' }}</span>
    </button>

    <div v-if="expanded" class="wb-body">
      <div class="wb-strip">
        <div
          v-for="day in perDay"
          :key="day.date"
          class="wb-day"
          :class="{ 'is-today': day.isToday }"
        >
          <div class="wb-day-label">{{ dayShortLabel(day.date, day.isToday) }}</div>
          <div class="wb-day-track">
            <div
              class="wb-day-fill"
              :class="day.calories > (targets.calories || 0) ? 'over' : ''"
              :style="{ height: barHeightPct(day.calories) + '%' }"
            />
            <div
              class="wb-day-target-line"
              :style="{ bottom: targetLinePct + '%' }"
              title="Daily target"
            />
          </div>
          <div class="wb-day-value">{{ day.calories ? fmt(day.calories) : '' }}</div>
        </div>
      </div>

      <div class="wb-macros">
        <MacroBar label="Cal (week)" :current="r(consumed.calories)" :target="weekTarget.calories" color="var(--color-cal)" unit=" kcal" :scale-max="weekScaleMax" />
        <MacroBar label="Protein (week)" :current="r(consumed.protein)" :target="weekTarget.protein" color="var(--color-protein)" unit="g" :scale-max="weekScaleMax" />
        <MacroBar label="Fat (week)" :current="r(consumed.fat)" :target="weekTarget.fat" color="var(--color-fat)" unit="g" :scale-max="weekScaleMax" />
        <MacroBar label="Carbs (week)" :current="r(consumed.carbs)" :target="weekTarget.carbs" color="var(--color-carbs)" unit="g" :scale-max="weekScaleMax" />
      </div>

      <div class="wb-adjusted">
        <div class="wb-adj-label">Today vs adjusted target</div>
        <div class="wb-adj-values">
          <span class="adj-cal" :class="perDay[6].calories > adjustedToday.calories ? 'adj-over' : ''">
            {{ fmt(perDay[6].calories) }} / {{ fmt(adjustedToday.calories) }} kcal
          </span>
          <span class="adj-p" :class="perDay[6].protein > adjustedToday.protein ? 'adj-over' : ''">
            {{ fmt(perDay[6].protein) }} / {{ fmt(adjustedToday.protein) }}g P
          </span>
          <span class="adj-f" :class="perDay[6].fat > adjustedToday.fat ? 'adj-over' : ''">
            {{ fmt(perDay[6].fat) }} / {{ fmt(adjustedToday.fat) }}g F
          </span>
          <span class="adj-c" :class="perDay[6].carbs > adjustedToday.carbs ? 'adj-over' : ''">
            {{ fmt(perDay[6].carbs) }} / {{ fmt(adjustedToday.carbs) }}g C
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.weekly-budget {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.wb-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.55rem 0.8rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--text);
  text-align: left;
}
.wb-title {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  font-weight: 600;
}
.wb-value { font-weight: 600; font-variant-numeric: tabular-nums; }
.wb-value.over { color: var(--danger); }
.wb-value.under { color: var(--success); }
.wb-sep { color: var(--text-secondary); }
.wb-caret {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 0.75rem;
}

.wb-body {
  padding: 0.2rem 0.8rem 0.8rem;
  border-top: 1px solid var(--border);
}

/* 7-day strip */
.wb-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.3rem;
  margin: 0.7rem 0 0.85rem;
}
.wb-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  min-width: 0;
}
.wb-day-label {
  font-size: 0.65rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.wb-day.is-today .wb-day-label {
  color: var(--primary);
  font-weight: 700;
}
.wb-day-track {
  position: relative;
  width: 100%;
  height: 44px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}
.wb-day-fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-cal);
  transition: height 0.25s;
}
.wb-day-fill.over { background: var(--danger); }
.wb-day-target-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--track-target-line);
  box-shadow: 0 0 0 0.5px var(--track-target-halo);
  pointer-events: none;
}
.wb-day.is-today .wb-day-track {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
}
.wb-day-value {
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

/* Weekly macro bars */
.wb-macros { margin-bottom: 0.7rem; }

/* Adjusted-today row */
.wb-adjusted {
  padding-top: 0.55rem;
  border-top: 1px dashed var(--border);
}
.wb-adj-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.wb-adj-values {
  display: flex;
  gap: 0.7rem;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.adj-cal { color: var(--color-cal); }
.adj-p { color: var(--color-protein); }
.adj-f { color: var(--color-fat); }
.adj-c { color: var(--color-carbs); }
.wb-adj-values .adj-over { color: var(--danger); }
</style>
