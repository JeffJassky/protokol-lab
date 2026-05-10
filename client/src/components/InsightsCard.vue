<script setup>
import { computed, ref, watch } from 'vue';
import { useInsightsStore } from '../stores/insights.js';
import { useChatStarterStore } from '../stores/chatStarter.js';
import { useSettingsStore } from '../stores/settings.js';
import InsightsChart from './InsightsChart.vue';

const props = defineProps({
  // Optional override of the analysis window. Defaults to the engine's
  // 90-day default; the dashboard typically lets that default ride.
  from: { type: String, default: null },
  to: { type: String, default: null },
});

const insights = useInsightsStore();
const chatStarter = useChatStarterStore();
const settings = useSettingsStore();
// Only one finding's chart is expanded at a time — keeps the surface tidy
// and avoids spawning a chart per finding (each pulls 1-2 series fetches).
const expandedId = ref(null);

watch(
  () => [props.from, props.to],
  () => {
    insights.load({
      from: props.from || undefined,
      to: props.to || undefined,
    });
  },
  { immediate: true },
);

const minConfidence = computed(() => {
  const m = Number(settings.settings?.insights?.minConfidence);
  return Number.isFinite(m) ? m : 0.4;
});
const findings = computed(() =>
  insights.findings.filter((f) => (f.confidence ?? 0) >= minConfidence.value),
);
const loading = computed(() => insights.loading);
const error = computed(() => insights.error);
const windowLabel = computed(() => {
  const w = insights.window;
  if (!w?.from || !w?.to) return '';
  return `Insights from ${w.from} → ${w.to}`;
});

function confidencePct(f) {
  return Math.round((f.confidence ?? 0) * 100);
}

function confidenceTone(f) {
  const c = f.confidence ?? 0;
  if (c >= 0.65) return 'high';
  if (c >= 0.4) return 'med';
  return 'low';
}

function kindBadge(kind) {
  switch (kind) {
    case 'correlation': return 'Correlation';
    case 'change-point': return 'Trend shift';
    case 'projection': return 'Projection';
    case 'anomaly': return 'Anomaly';
    case 'streak': return 'Streak';
    default: return kind || 'Insight';
  }
}

function toggleChart(f) {
  expandedId.value = expandedId.value === f.id ? null : f.id;
}

function onExplain(f) {
  if (!f.explainPrompt) return;
  chatStarter.start(f.explainPrompt);
}
</script>

<template>
  <section class="insights-card">
    <header class="ic-head">
      <h3>Insights</h3>
      <span v-if="windowLabel" class="ic-window">{{ windowLabel }}</span>
    </header>

    <p v-if="loading && !findings.length" class="ic-state">Looking for patterns…</p>
    <p v-else-if="error" class="ic-state error">{{ error }}</p>
    <p v-else-if="!findings.length" class="ic-state empty">
      Need more days of data before patterns become reliable. Keep logging —
      this section will fill in once there's enough overlap across your
      active series.
    </p>

    <ul v-else class="ic-list">
      <li
        v-for="f in findings"
        :key="f.id"
        class="ic-item"
        :class="`tone-${confidenceTone(f)}`"
      >
        <div class="ic-item-head">
          <span class="ic-kind">{{ kindBadge(f.kind) }}</span>
          <span class="ic-conf" :title="`Confidence ${confidencePct(f)}%`">
            <span class="ic-conf-track" aria-hidden="true">
              <span
                class="ic-conf-fill"
                :style="{ width: confidencePct(f) + '%' }"
              />
            </span>
            {{ confidencePct(f) }}%
          </span>
        </div>
        <div class="ic-title">{{ f.title }}</div>
        <div class="ic-claim">{{ f.claim }}</div>
        <div class="ic-actions">
          <button
            type="button"
            class="ic-btn ic-btn-ghost"
            :aria-expanded="expandedId === f.id"
            @click="toggleChart(f)"
            v-tooltip="'Render the relevant series in-place so you can see the evidence behind this finding'"
          >
            {{ expandedId === f.id ? 'Hide chart' : 'Show chart' }}
          </button>
          <button
            v-if="f.explainPrompt"
            type="button"
            class="ic-btn ic-btn-primary"
            @click="onExplain(f)"
            v-tooltip="'Open the chat with this question already teed up'"
          >
            Explain
          </button>
        </div>
        <InsightsChart v-if="expandedId === f.id" :finding="f" />
      </li>
    </ul>
  </section>
</template>

<style scoped>
.insights-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-4);
}
.ic-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.ic-head h3 {
  margin: 0;
  font-size: var(--font-size-m);
}
.ic-window {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-family: var(--font-display);
}
.ic-state {
  margin: 0;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  text-align: center;
  padding: var(--space-5) 0;
}
.ic-state.empty { color: var(--text-tertiary); }
.ic-state.error { color: var(--danger); }

.ic-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}
.ic-item {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: var(--space-3) var(--space-4);
  display: grid;
  gap: var(--space-1);
}
/* Confidence-tone accent on the left edge — high confidence pops, low
   stays muted. Matches the "every claim is linkable to evidence" promise:
   you can see at a glance which findings are robust. */
.ic-item.tone-high { border-left: 3px solid var(--success, var(--primary)); }
.ic-item.tone-med  { border-left: 3px solid var(--primary); }
.ic-item.tone-low  { border-left: 3px solid var(--border-strong, var(--border)); }

.ic-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.ic-kind {
  font-family: var(--font-display);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.ic-conf {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.ic-conf-track {
  display: inline-block;
  width: 36px;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.ic-conf-fill {
  display: block;
  height: 100%;
  background: var(--primary);
  transition: width var(--transition-base);
}
.ic-title {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  line-height: 1.3;
}
.ic-claim {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.ic-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.ic-btn {
  font-family: inherit;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  border-radius: var(--radius-small);
  transition: border-color var(--transition-base), color var(--transition-base), background var(--transition-base);
}
.ic-btn-ghost:hover { border-color: var(--text-secondary); }
.ic-btn-primary {
  border-color: var(--primary);
  color: var(--primary);
}
.ic-btn-primary:hover {
  background: var(--primary);
  color: var(--text-on-primary);
}
</style>
