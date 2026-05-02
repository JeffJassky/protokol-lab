<script setup>
import { onMounted, onUnmounted, computed } from 'vue';
import { useFastingStore } from '../stores/fasting.js';
import { useSettingsStore } from '../stores/settings.js';
import { formatDuration } from '../../../shared/fasting.js';

// Persistent status banner for fasting. Renders one of:
//   - eating window: thin row, "Fast starts in 3h 12m at 8:00 PM"
//   - active fast:   bold row with elapsed/remaining + stage chip + End btn
//   - past goal:     ring full, count-up keeps going, prompt to End
// Hidden entirely when fasting is disabled or no schedule is configured.

const props = defineProps({
  // Which surface the banner is mounted on — gates the banner against the
  // settings.fasting.showOnLog / showOnDashboard toggles.
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

// Hide entirely on 'disabled' or 'eating_no_next' — non-fasting users
// shouldn't lose vertical real estate.
const status = computed(() => fasting.status);
const visible = computed(() => {
  if (!visibleForSurface.value) return false;
  const st = status.value.state;
  return st === 'active' || st === 'past_goal' || st === 'eating';
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
    <!-- Active or past-goal fast — primary banner with progress bar. -->
    <template v-if="status.state === 'active' || status.state === 'past_goal'">
      <div class="fb-head">
        <div class="fb-state">
          <span class="fb-dot" />
          <span class="fb-label">
            <template v-if="status.state === 'past_goal'">Goal reached</template>
            <template v-else>Fasting</template>
          </span>
          <span v-if="status.stage" class="fb-stage">{{ status.stage }}</span>
        </div>
        <button type="button" class="fb-action" @click="handleEnd">End</button>
      </div>
      <div class="fb-times">
        <span class="fb-time">
          <span class="fb-time-label">Elapsed</span>
          <span class="fb-time-val">{{ formatDuration(status.elapsedMinutes) }}</span>
        </span>
        <span
          v-if="status.remainingMinutes != null && status.state === 'active'"
          class="fb-time"
        >
          <span class="fb-time-label">Remaining</span>
          <span class="fb-time-val">{{ formatDuration(status.remainingMinutes) }}</span>
        </span>
        <span v-else-if="status.state === 'past_goal'" class="fb-time">
          <span class="fb-time-label">Past goal</span>
          <span class="fb-time-val">+{{ formatDuration(-status.remainingMinutes) }}</span>
        </span>
      </div>
      <div class="fb-bar">
        <div
          class="fb-bar-fill"
          :style="{ width: `${Math.min(100, (status.progress || 0) * 100)}%` }"
        />
      </div>
    </template>

    <!-- Eating window — compact countdown row. -->
    <template v-else-if="status.state === 'eating'">
      <div class="fb-head">
        <div class="fb-state">
          <span class="fb-dot eating" />
          <span class="fb-label">Eating window</span>
        </div>
        <button type="button" class="fb-action ghost" @click="handleStart">
          Start fast
        </button>
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
  border-left: 3px solid var(--border-strong);
  border-radius: var(--radius-medium);
  margin-bottom: var(--space-3);
}
.fasting-banner.active { border-left-color: var(--primary); }
.fasting-banner.past_goal { border-left-color: var(--success); }
.fasting-banner.eating { border-left-color: var(--text-tertiary); padding: var(--space-2) var(--space-4); }

.fb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.fb-state { display: inline-flex; align-items: center; gap: var(--space-2); min-width: 0; }
.fb-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
  flex: none;
}
.fb-dot.eating { background: var(--text-tertiary); box-shadow: none; }
.fasting-banner.past_goal .fb-dot { background: var(--success); box-shadow: 0 0 0 3px var(--primary-soft); }
.fb-label {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  letter-spacing: var(--tracking-tight);
}
.fb-stage {
  margin-left: var(--space-2);
  padding: 2px 8px;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
}
.fb-action {
  padding: 0.3rem 0.85rem;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  background: var(--primary);
  color: var(--text-on-primary);
  border: 1px solid var(--primary);
  border-radius: var(--radius-small);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.fb-action:hover { background: var(--primary-hover); }
.fb-action.ghost {
  background: transparent;
  color: var(--text);
  border-color: var(--border-strong);
}
.fb-action.ghost:hover { border-color: var(--text-secondary); }

.fb-times {
  display: flex;
  gap: var(--space-4);
  align-items: baseline;
}
.fb-time { display: inline-flex; flex-direction: column; gap: 2px; }
.fb-time-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.fb-time-val {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}

.fb-bar {
  height: 4px;
  background: var(--bg);
  border-radius: 2px;
  overflow: hidden;
}
.fb-bar-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.4s ease;
}
.fasting-banner.past_goal .fb-bar-fill { background: var(--success); }

.fb-sub {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
}
.fb-sub strong { color: var(--text); font-variant-numeric: tabular-nums; }
</style>
