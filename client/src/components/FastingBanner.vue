<script setup>
import { onMounted, onUnmounted, computed, ref } from 'vue';
import { useFastingStore } from '../stores/fasting.js';
import { useSettingsStore } from '../stores/settings.js';
import {
  formatDuration,
  STAGE_THRESHOLDS,
} from '../../../shared/logging/fasting.js';

// Persistent status banner for fasting. Renders one of:
//   - eating window: thin row, "Fast starts in 3h 12m at 8:00 PM"
//   - active fast:   header + segmented goal-anchored bar with stage labels
//   - past goal:     bar full + a small "past goal" line with current stage
// Hidden entirely when fasting is disabled or no schedule is configured.

const props = defineProps({
  surface: {
    type: String,
    default: 'log', // 'log' | 'dashboard'
    validator: (v) => ['log', 'dashboard'].includes(v),
  },
});

const fasting = useFastingStore();
const settings = useSettingsStore();

const visibleForSurface = computed(() => {
  const s = settings.settings?.fasting;
  if (!s || !s.enabled) return false;
  if (props.surface === 'log') return s.showOnLog !== false;
  if (props.surface === 'dashboard') return s.showOnDashboard !== false;
  return true;
});

const status = computed(() => fasting.status);
const visible = computed(() => {
  if (!visibleForSurface.value) return false;
  const st = status.value.state;
  return st === 'active' || st === 'past_goal' || st === 'eating';
});

// Goal duration for the current fast, in minutes. Drives the segmented bar.
const goalMinutes = computed(() => {
  const s = status.value;
  if (!s.startAt || !s.plannedEnd) return null;
  return Math.max(1, Math.round((new Date(s.plannedEnd) - new Date(s.startAt)) / 60000));
});

// Stage segments clipped to [0, goalMinutes]. Each entry has the label, the
// minute range it covers within the bar, and pre-computed % width/offset.
const segments = computed(() => {
  const goal = goalMinutes.value;
  if (!goal) return [];
  const out = [];
  for (let i = 0; i < STAGE_THRESHOLDS.length; i++) {
    const startMin = STAGE_THRESHOLDS[i].minMinutes;
    if (startMin >= goal) break;
    const nextMin = i + 1 < STAGE_THRESHOLDS.length
      ? STAGE_THRESHOLDS[i + 1].minMinutes
      : Infinity;
    const endMin = Math.min(nextMin, goal);
    out.push({
      label: STAGE_THRESHOLDS[i].label,
      startMin,
      endMin,
      startPct: (startMin / goal) * 100,
      widthPct: ((endMin - startMin) / goal) * 100,
    });
  }
  // Mark the segment containing current elapsed (clipped to bar).
  const elapsed = Math.min(status.value.elapsedMinutes || 0, goal - 0.0001);
  for (const seg of out) {
    seg.current = elapsed >= seg.startMin && elapsed < seg.endMin;
  }
  return out;
});

const fillPct = computed(() => {
  const goal = goalMinutes.value;
  if (!goal) return 0;
  return Math.max(0, Math.min(100, ((status.value.elapsedMinutes || 0) / goal) * 100));
});

// Time readout toggles between elapsed (default) and remaining on tap.
// During past_goal the "remaining" view shows how far past goal we are.
const showRemaining = ref(false);
function toggleTime() {
  showRemaining.value = !showRemaining.value;
}
const timeReadout = computed(() => {
  const s = status.value;
  if (showRemaining.value && s.remainingMinutes != null) {
    if (s.state === 'past_goal') {
      return { value: `+${formatDuration(-s.remainingMinutes)}`, label: 'past goal' };
    }
    return { value: formatDuration(s.remainingMinutes), label: 'remaining' };
  }
  return { value: formatDuration(s.elapsedMinutes), label: 'elapsed' };
});

function fmtTime(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

async function handleStart() {
  await fasting.startManual();
}
async function handleEnd() {
  if (!confirm('End your current fast?')) return;
  await fasting.endNow();
}

onMounted(async () => {
  if (!settings.loaded) await settings.fetchSettings();
  if (!fasting.loaded) await fasting.fetchEvents();
  fasting.startTicking();
});

onUnmounted(() => {
  fasting.stopTicking();
});
</script>

<template>
  <div v-if="visible" class="fasting-banner" :class="status.state">
    <!-- Active or past-goal fast -->
    <template v-if="status.state === 'active' || status.state === 'past_goal'">
      <div class="fb-head">
        <span class="fb-state">
          <span class="fb-dot" />
          <span class="fb-label">{{ status.state === 'past_goal' ? 'Goal reached' : 'Fasting' }}</span>
          <button
            type="button"
            class="fb-time-toggle"
            :title="`Tap to show ${showRemaining ? 'elapsed' : 'remaining'}`"
            @click="toggleTime"
          >
            <span class="fb-time-val">{{ timeReadout.value }}</span>
            <span class="fb-time-suffix">{{ timeReadout.label }}</span>
          </button>
        </span>
        <button type="button" class="fb-action" @click="handleEnd">End</button>
      </div>
      <div class="fb-track">
        <div
          v-for="seg in segments"
          :key="seg.label"
          class="fb-seg"
          :class="{ current: seg.current }"
          :style="{ left: `${seg.startPct}%`, width: `${seg.widthPct}%` }"
        >
          <span class="fb-seg-label">{{ seg.label }}</span>
        </div>
        <div class="fb-fill" :style="{ width: `${fillPct}%` }" />
      </div>
      <div v-if="status.state === 'past_goal'" class="fb-past">
        Currently in {{ status.stage }}
      </div>
    </template>

    <!-- Eating window -->
    <template v-else-if="status.state === 'eating'">
      <div class="fb-head">
        <span class="fb-state">
          <span class="fb-dot eating" />
          <span class="fb-label">Eating window</span>
        </span>
        <button type="button" class="fb-action ghost" @click="handleStart">Start fast</button>
      </div>
      <div class="fb-sub">
        Fast starts in
        <strong>{{ formatDuration(status.minutesUntilNext) }}</strong>
        at {{ fmtTime(status.nextStartAt) }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.fasting-banner {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  margin-bottom: var(--space-3);
}
.fasting-banner.eating { padding: var(--space-2) var(--space-4); }

.fb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.fb-state { display: inline-flex; align-items: center; gap: var(--space-2); min-width: 0; }
.fb-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  flex: none;
}
.fb-dot.eating { background: var(--text-tertiary); }
.fasting-banner.past_goal .fb-dot { background: var(--success); }
.fb-label {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
}
.fb-time-toggle {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.fb-time-toggle:hover .fb-time-val { color: var(--text); }
.fb-time-val {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
  transition: color var(--transition-fast);
}
.fb-time-suffix {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  text-transform: lowercase;
}
.fb-action {
  padding: 0.25rem 0.7rem;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-small);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}
.fb-action:hover { color: var(--text); border-color: var(--text-secondary); }
.fb-action.ghost { /* same default styling already ghost-ish */ }

/* Segmented goal-anchored progress bar. Track = relative container.
   Segments are absolutely positioned, drawn behind the fill, with labels
   bleeding past their boundaries (overflow visible) so narrow segments
   stay readable. */
.fb-track {
  position: relative;
  height: 22px;
  background: var(--bg);
  border-radius: var(--radius-small);
  overflow: visible;
}
.fb-seg {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  border-right: 1px solid var(--border);
  overflow: visible;
  pointer-events: none;
}
.fb-seg:last-child { border-right: none; }
.fb-seg-label {
  padding-left: 6px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  white-space: nowrap;
  position: relative;
  z-index: 2;
}
.fb-seg.current .fb-seg-label { color: var(--text); }
.fb-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: var(--primary-soft);
  border-radius: var(--radius-small) 0 0 var(--radius-small);
  transition: width 0.4s ease;
  z-index: 1;
}
.fasting-banner.past_goal .fb-fill {
  background: var(--success);
  opacity: 0.25;
  border-radius: var(--radius-small);
}

.fb-past {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.fb-sub {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
}
.fb-sub strong { color: var(--text); font-variant-numeric: tabular-nums; }
</style>
