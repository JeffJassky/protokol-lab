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

// Interpretive note describing the week's shape. Compare what's been eaten so
// far to a straight-line pro-rata of the week's target up through today, then
// pick a short narrative — on track, banked surplus, or over budget.
// Mirrors the DailySummary `suggestion` pattern but applied weekly so the
// numbers become a sentence instead of bare arithmetic.
const weekNote = computed(() => {
  const w = weekTarget.value?.calories;
  const c = consumed.value?.calories;
  if (!w || c == null) return null;
  // Fraction of the week that has elapsed by end-of-today (perDay[6] = today).
  const todayIdx = 6;
  const expected = (w * (todayIdx + 1)) / 7;
  const diff = c - expected;
  const absDiff = Math.round(Math.abs(diff));
  const pct = expected ? Math.abs(diff) / expected : 0;
  if (pct < 0.05) {
    return { tone: 'good', body: 'On pace for your weekly target.' };
  }
  if (diff < 0) {
    return {
      tone: 'bank',
      body: `${absDiff.toLocaleString()} kcal under pace — those roll over to the rest of the week.`,
    };
  }
  return {
    tone: 'over',
    body: `${absDiff.toLocaleString()} kcal over pace — eat lighter to close the gap.`,
  };
});

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

// Per-macro view-model for the "Today vs adjusted target" grid. Pulls
// today's intake (perDay[6]) + the adjusted target (target rebalanced for
// prior days' surplus/deficit) and packages each macro with its color,
// unit, and over/busted flags so the template stays declarative.
// Weekly progress bars + a today-remaining annotation per macro. The note
// is derived from `adjustedToday` (today's target rebalanced for the week's
// surplus / deficit) so a single row tells you both the weekly pace and the
// action item for today.
const weekMacroBars = computed(() => {
  const today = perDay.value[6] || {};
  const adj = adjustedToday.value || {};
  const w = weekTarget.value || {};
  const c = consumed.value || {};
  const macros = [
    { key: 'cal', label: 'Calories',     short: 'kcal', unit: ' kcal', color: 'var(--color-cal)',     current: r(c.calories), target: w.calories, todayValue: today.calories || 0, todayTarget: adj.calories || 0 },
    { key: 'p',   label: 'Protein', short: 'g',    unit: 'g',     color: 'var(--color-protein)', current: r(c.protein),  target: w.protein,  todayValue: today.protein  || 0, todayTarget: adj.protein  || 0 },
    { key: 'f',   label: 'Fat',     short: 'g',    unit: 'g',     color: 'var(--color-fat)',     current: r(c.fat),      target: w.fat,      todayValue: today.fat      || 0, todayTarget: adj.fat      || 0 },
    { key: 'c',   label: 'Carbs',   short: 'g',    unit: 'g',     color: 'var(--color-carbs)',   current: r(c.carbs),    target: w.carbs,    todayValue: today.carbs    || 0, todayTarget: adj.carbs    || 0 },
  ];
  return macros.map((m) => {
    let note = '';
    let noteTone = 'muted';
    if (m.todayTarget <= 0) {
      note = `over by ${fmt(-m.todayTarget)}${m.short}`;
      noteTone = 'over';
    } else if (m.todayValue > m.todayTarget) {
      note = `over by ${fmt(m.todayValue - m.todayTarget)}${m.short}`;
      noteTone = 'over';
    } else {
      note = `${fmt(m.todayTarget - m.todayValue)}${m.short} left today`;
    }
    return { ...m, note, noteTone };
  });
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

// Bottom segment: portion of intake up to (but not past) the daily target.
function normalHeightPct(cal) {
  const t = targets.value?.calories || 0;
  return (Math.min(cal, t) / maxDayCal.value) * 100;
}

// Top segment: only the overage above the daily target.
function overHeightPct(cal) {
  const t = targets.value?.calories || 0;
  if (cal <= t) return 0;
  return ((cal - t) / maxDayCal.value) * 100;
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
      <div class="wb-stat">
        <span class="wb-stat-label">7-day budget</span>
        <span class="wb-stat-value">
          {{ fmt(consumed.calories)



























          }}<span class="wb-stat-tgt"> / {{ fmt(weekTarget.calories) }}</span>
        </span>
      </div>
      <div class="wb-stat right">
        <span class="wb-stat-label">{{ calDelta >= 0 ? 'Left' : 'Over' }}</span>
        <span class="wb-stat-value" :class="deltaClass(calDelta)">
          {{ Math.abs(Math.round(calDelta || 0)).toLocaleString()



























          }}<span class="wb-stat-unit"> kcal</span>
        </span>
      </div>
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
          <div class="wb-day-label">
            {{ dayShortLabel(day.date, day.isToday) }}
          </div>
          <div class="wb-day-track">
            <div
              class="wb-day-fill"
              :style="{ height: normalHeightPct(day.calories) + '%' }"
            />
            <div
              v-if="overHeightPct(day.calories) > 0"
              class="wb-day-over"
              :style="{ bottom: targetLinePct + '%', height: overHeightPct(day.calories) + '%' }"
            />
            <div
              class="wb-day-target-line"
              :style="{ bottom: targetLinePct + '%' }"
              title="Daily target"
            />
          </div>
          <div
            class="wb-day-value"
            :class="{ over: day.calories > (targets.calories || 0) }"
          >
            {{ day.calories ? fmt(day.calories) : '' }}
          </div>
        </div>
      </div>

      <div class="wb-macros">
        <MacroBar
          v-for="m in weekMacroBars"
          :key="m.key"
          :label="m.label"
          :current="m.current"
          :target="m.target"
          :color="m.color"
          :unit="m.unit"
          :scale-max="weekScaleMax"
          :note="m.note"
          :note-tone="m.noteTone"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.weekly-budget {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
}

.wb-header {
  display: flex;
  align-items: flex-end;
  gap: var(--space-4);
  width: 100%;
  padding: var(--space-4) var(--space-5);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text);
  text-align: left;
}
.wb-stat { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.wb-stat.right { margin-left: auto; text-align: right; align-items: flex-end; }
.wb-stat-label {
  font-size: var(--font-size-xs);
  font-family: var(--font-display);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-secondary);
  font-weight: var(--font-weight-bold);
  line-height: 1;
}
.wb-stat-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: var(--text);
}
.wb-stat-tgt {
  font-size: var(--font-size-s);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-light);
}
.wb-stat-unit {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-light);
}
.wb-stat-value.over  { color: var(--danger); }
.wb-stat-value.under { color: var(--success); }
.wb-caret {
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  align-self: center;
}

.wb-body {
  padding: var(--space-2) var(--space-5) var(--space-4);
  border-top: 1px solid var(--border);
}

/* 7-day strip */
.wb-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--space-1);
  margin: var(--space-3) 0 var(--space-3);
}
.wb-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}
.wb-day-label {
  font-size: var(--font-size-xs);
  font-family: var(--font-display);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}
.wb-day.is-today .wb-day-label {
  color: var(--primary);
  font-weight: var(--font-weight-bold);
}
.wb-day-track {
  position: relative;
  width: 100%;
  height: 44px;
  background: var(--surface-raised);
  border-radius: var(--radius-small);
  overflow: hidden;
}
.wb-day-fill {
  position: absolute;
  left: 0;
  right: 0;
  background: var(--border-strong);
  bottom: 0;
  transition: height 0.25s;
}
.wb-day-over {
  position: absolute;
  left: 0;
  right: 0;
  background: var(--danger);
  transition: height 0.25s, bottom 0.25s;
}
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
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  color: var(--text);
  font-weight: var(--font-weight-bold);
}
.wb-day-value.over { color: var(--danger); }

/* Interpretive note — turns the week's numbers into a sentence. */
.wb-note {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-3);
  font-size: var(--font-size-s);
  line-height: 1.4;
  background: var(--bg);
  border-left: 2px solid var(--border);
  color: var(--text-secondary);
}
.wb-note-arrow { flex-shrink: 0; }
.wb-note.tone-good { border-left-color: var(--success); }
.wb-note.tone-good .wb-note-arrow { color: var(--success); }
.wb-note.tone-bank { border-left-color: var(--primary); }
.wb-note.tone-bank .wb-note-arrow { color: var(--primary); }
.wb-note.tone-over { border-left-color: var(--danger); }
.wb-note.tone-over .wb-note-arrow { color: var(--danger); }

/* Weekly macro bars */
.wb-macros { margin-bottom: var(--space-1); }
</style>
