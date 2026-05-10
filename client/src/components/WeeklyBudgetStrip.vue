<script setup>
import { ref, computed, onMounted } from 'vue';
import { useWeeklyBudget } from '../composables/useWeeklyBudget.js';
import { useDayStatusStore } from '../stores/dayStatus.js';
import MacroBar from './MacroBar.vue';

const props = defineProps({
  defaultExpanded: { type: Boolean, default: false },
});

const {
  targets, weekTarget, perDay, counted, countedDays,
  consumed, delta, adjustedToday, eLrgyMode, windowLabel,
} = useWeeklyBudget();
const dayStatusStore = useDayStatusStore();

// Day-status menu state. `menuDate` holds the YYYY-MM-DD whose menu is
// open; null means closed. The menu lets the user override auto-
// classification: mark a day tracked / untracked, pick a reason, or
// clear the explicit row to revert to auto.
const menuDate = ref(null);
const menuStatus = ref('tracked');
const menuReason = ref('other');

const VALID_REASONS = {
  tracked: [
    { key: 'fasted', label: 'Fasted' },
    { key: 'other',  label: 'Other' },
  ],
  untracked: [
    { key: 'forgot',   label: 'Forgot to log' },
    { key: 'partial',  label: 'Partial / unreliable' },
    { key: 'vacation', label: 'Vacation' },
    { key: 'holiday',  label: 'Holiday' },
    { key: 'illness',  label: 'Illness' },
    { key: 'other',    label: 'Other' },
  ],
};

function openDayMenu(day) {
  menuDate.value = day.date;
  // If user already explicitly set this day, prefill from their choice.
  // Otherwise prefill the inverse of the current effective status —
  // tapping a day usually means "I want to flip this".
  const explicit = dayStatusStore.getStatus(day.date);
  if (explicit) {
    menuStatus.value = explicit.status;
    menuReason.value = explicit.reason || 'other';
  } else {
    menuStatus.value = day.disposition === 'untracked' ? 'tracked' : 'untracked';
    menuReason.value = menuStatus.value === 'tracked' ? 'fasted' : 'forgot';
  }
}

function closeDayMenu() {
  menuDate.value = null;
}

async function applyDayMenu() {
  if (!menuDate.value) return;
  await dayStatusStore.setStatus(menuDate.value, {
    status: menuStatus.value,
    reason: menuReason.value,
  });
  menuDate.value = null;
}

async function revertDayMenu() {
  if (!menuDate.value) return;
  await dayStatusStore.clearStatus(menuDate.value);
  menuDate.value = null;
}

// Reason picker keeps options consistent with the chosen status.
const menuReasonOptions = computed(() => VALID_REASONS[menuStatus.value] || []);

// When the user flips status mid-menu, drop the reason if it doesn't
// belong on the new status. (Keeps `tracked + partial` etc. impossible.)
function onMenuStatusChange() {
  const valid = new Set(VALID_REASONS[menuStatus.value].map((r) => r.key));
  if (!valid.has(menuReason.value)) {
    menuReason.value = menuStatus.value === 'tracked' ? 'fasted' : 'forgot';
  }
}
const expanded = ref(props.defaultExpanded);

function r(n) { return Math.round(n); }
function fmt(n) { return Math.round(n).toLocaleString(); }

// Same entry-animation pattern as MacroBar: render the day bars at height 0
// on first paint, then flip the gate on the next frame so the browser sees a
// 0 → finalHeight transition. Double rAF prevents Vue from batching the gate
// flip into the same frame as initial mount.
const animateIn = ref(false);
function triggerEntryAnimation() {
  animateIn.value = false;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateIn.value = true;
    });
  });
}
onMounted(() => {
  // Only matters when defaultExpanded=true on first mount; otherwise the
  // expand handler runs the same routine when the user opens the panel.
  if (expanded.value) triggerEntryAnimation();
});

// Re-arm the gate before the v-if mounts the bars so they render at height 0
// for one frame, then transition to final values. Setting animateIn=false
// before flipping expanded is critical — Vue evaluates the children's style
// bindings synchronously when the v-if becomes true.
function toggleExpanded() {
  if (expanded.value) {
    expanded.value = false;
    return;
  }
  animateIn.value = false;
  expanded.value = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateIn.value = true;
    });
  });
}

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
  if (!animateIn.value) return 0;
  return (cal / maxDayCal.value) * 100;
}

// Bottom segment: portion of intake up to (but not past) the daily target.
function normalHeightPct(cal) {
  if (!animateIn.value) return 0;
  const t = targets.value?.calories || 0;
  return (Math.min(cal, t) / maxDayCal.value) * 100;
}

// Top segment: only the overage above the daily target.
function overHeightPct(cal) {
  if (!animateIn.value) return 0;
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
      @click="toggleExpanded"
    >
      <div class="wb-stat">
        <span class="wb-stat-label">{{ windowLabel || '7-day budget' }}</span>
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
      <div class="wb-counted-row">
        <span class="wb-counted-label">
          {{ countedDays }} of 7 days counted
        </span>
        <span v-if="countedDays === 0" class="wb-counted-empty">
          Log something to see your weekly pace.
        </span>
      </div>

      <div class="wb-strip">
        <button
          v-for="(day, i) in perDay"
          :key="day.date"
          type="button"
          class="wb-day"
          :class="{
            'is-today': day.isToday,
            'is-untracked': day.disposition === 'untracked',
            'is-explicit': day.dispositionSource === 'explicit',
          }"
          :style="{ '--bar-index': i }"
          @click.stop="openDayMenu(day)"
        >
          <div class="wb-day-label">
            {{ dayShortLabel(day.date, day.isToday) }}
          </div>
          <div class="wb-day-track">
            <div
              v-if="day.isCounted"
              class="wb-day-fill"
              :style="{ height: normalHeightPct(day.calories) + '%' }"
            />
            <div
              v-if="day.isCounted"
              class="wb-day-over"
              :style="{ height: overHeightPct(day.calories) + '%' }"
            />
            <div
              v-if="day.isCounted"
              class="wb-day-target-line"
              :style="{ bottom: targetLinePct + '%' }"
              title="Daily target"
            />
            <div v-if="!day.isCounted" class="wb-day-untracked-mark">↷</div>
          </div>
          <div
            class="wb-day-value"
            :class="{ over: day.isCounted && day.calories > (targets.calories || 0) }"
          >
            <template
              v-if="day.isCounted"
              >{{ day.calories ? fmt(day.calories) : '' }}</template
            >
            <template v-else>untracked</template>
          </div>
        </button>
      </div>

      <div v-if="countedDays > 0" class="wb-macros">
        <MacroBar
          v-for="(m, i) in weekMacroBars"
          :key="m.key"
          :index="i"
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

    <!-- Day-status menu. Inline popover anchored at the bottom of the
         strip — keeps the user's eye on the day they tapped instead of
         a full-screen modal context shift. -->
    <div v-if="menuDate" class="wb-menu-backdrop" @click.self="closeDayMenu">
      <div class="wb-menu">
        <h4>{{ menuDate }}</h4>
        <div class="wb-menu-row">
          <span class="wb-menu-label">Status</span>
          <div class="wb-status-tabs">
            <button
              type="button"
              class="wb-status-tab"
              :class="{ active: menuStatus === 'tracked' }"
              @click="menuStatus = 'tracked'; onMenuStatusChange()"
            >
              Tracked
            </button>
            <button
              type="button"
              class="wb-status-tab"
              :class="{ active: menuStatus === 'untracked' }"
              @click="menuStatus = 'untracked'; onMenuStatusChange()"
            >
              Untracked
            </button>
          </div>
        </div>
        <div class="wb-menu-row">
          <span class="wb-menu-label">Reason</span>
          <select v-model="menuReason" class="wb-menu-select">
            <option
              v-for="opt in menuReasonOptions"
              :key="opt.key"
              :value="opt.key"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>
        <p class="wb-menu-hint">
          <template v-if="menuStatus === 'tracked'">
            Day counts in the rolling budget. Use "Fasted" for intentional
            zero-calorie days.
          </template>
          <template v-else>
            Day excluded from rolling math — no banked calories from this day.
          </template>
        </p>
        <div class="wb-menu-actions">
          <button type="button" class="wb-menu-btn-text" @click="revertDayMenu">
            Revert to auto
          </button>
          <button
            type="button"
            class="wb-menu-btn-secondary"
            @click="closeDayMenu"
          >
            Cancel
          </button>
          <button
            type="button"
            class="wb-menu-btn-primary"
            @click="applyDayMenu"
          >
            Save
          </button>
        </div>
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
  /* column-reverse stacks fill on the bottom, over directly above it. Both
     bars then use simple `height` (no bottom anchor), so the height
     transition behaves identically for both. The previous `bottom: X%`
     anchor on the over bar was preventing reliable height interpolation. */
  display: flex;
  flex-direction: column-reverse;
}
/* Match MacroBar easing — out-quint for a deliberate settle. Per-day stagger
   via --bar-index makes the 7 days cascade Mon→Sun on initial render.
   Both bars are flex children of a column-reverse track, so each animates
   simple `height` from 0 → final and stack from the bottom up. */
.wb-day-fill {
  width: 100%;
  background: var(--border-strong);
  transition: height 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: calc(var(--bar-index, 0) * 70ms);
}
.wb-day-over {
  width: 100%;
  background: var(--danger);
  transition: height 0.55s cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: calc(var(--bar-index, 0) * 70ms);
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

/* Counted-day row + untracked day styling */
.wb-counted-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) 0 var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}
.wb-counted-label {
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
}
.wb-counted-empty {
  font-style: italic;
  color: var(--text-secondary);
}

/* Day cells now act as buttons (tap to open status menu) */
.wb-day {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: center;
}
.wb-day:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

/* Untracked styling — dashed outline + greyed track */
.wb-day.is-untracked .wb-day-track {
  outline: 1px dashed var(--border-strong);
  outline-offset: 0;
  background: var(--bg);
}
.wb-day.is-untracked .wb-day-label,
.wb-day.is-untracked .wb-day-value {
  color: var(--text-tertiary);
  font-style: italic;
}
.wb-day.is-untracked.is-explicit .wb-day-track {
  /* Solid outline when the user explicitly chose untracked, dashed when auto. */
  outline-style: solid;
}
.wb-day-untracked-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: var(--font-size-l);
  color: var(--text-tertiary);
  opacity: 0.6;
}

/* Day-status menu */
.wb-menu-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
  z-index: 200;
}
.wb-menu {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: var(--space-4);
  width: 92%;
  max-width: 420px;
}
.wb-menu h4 {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-s);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.wb-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.wb-menu-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.wb-status-tabs {
  display: inline-flex;
  background: var(--bg);
  border: 1px solid var(--border);
  padding: 2px;
  gap: 2px;
}
.wb-status-tab {
  padding: 4px 12px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  font-family: inherit;
}
.wb-status-tab.active {
  background: var(--surface);
  color: var(--text);
  font-weight: var(--font-weight-medium);
}
.wb-menu-select {
  padding: 4px 8px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: var(--font-size-s);
  color: var(--text);
  font-family: var(--font-mono);
}
.wb-menu-hint {
  margin: 0 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--bg);
  border-left: 2px solid var(--border);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.4;
}
.wb-menu-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.wb-menu-btn-text,
.wb-menu-btn-secondary,
.wb-menu-btn-primary {
  padding: 6px 14px;
  font-size: var(--font-size-s);
  cursor: pointer;
  border: 1px solid var(--border);
  font-family: inherit;
}
.wb-menu-btn-text {
  background: transparent;
  border-color: transparent;
  color: var(--text-tertiary);
  margin-right: auto;
}
.wb-menu-btn-text:hover { color: var(--text); }
.wb-menu-btn-secondary { background: var(--surface); color: var(--text-secondary); }
.wb-menu-btn-primary {
  background: var(--primary);
  color: var(--primary-fg, #fff);
  border-color: var(--primary);
}
</style>
