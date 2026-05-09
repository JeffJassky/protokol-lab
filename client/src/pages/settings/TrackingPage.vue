<script setup>
import { ref, onMounted, watch } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';

const store = useSettingsStore();

const confirmationMode = ref('passive');
const hydrated = ref(false);

const MODES = [
  {
    key: 'passive',
    label: 'Passive (recommended)',
    badge: 'Default',
    desc: 'Any day with logs is automatically counted. Days with zero entries are auto-flagged untracked. Override per-day from the 7-day strip.',
    bestWhen: 'You log when you eat and don\'t want extra confirmation taps.',
  },
  {
    key: 'affirmative',
    label: 'Affirmative',
    desc: 'Past days only count when you explicitly mark them tracked. Today still counts toward consumed while in progress; you confirm "complete" before midnight.',
    bestWhen: 'You want strict data quality and don\'t mind one tap per day.',
  },
];

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  const t = store.settings?.tracking || {};
  confirmationMode.value = ['passive', 'affirmative'].includes(t.confirmationMode)
    ? t.confirmationMode
    : 'passive';
  hydrated.value = true;
});

let saveTimer = null;
function scheduleSave() {
  if (!hydrated.value) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 500);
}

async function persist() {
  await store.patchSettings({
    tracking: { confirmationMode: confirmationMode.value },
  });
}

watch(confirmationMode, scheduleSave);
</script>

<template>
  <div class="tracking-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back">
        ‹ Profile
      </router-link>
      <h2 class="page-title">Tracking</h2>
    </div>

    <div class="card callout">
      Governs how the app handles missing or partial days across all
      tracking surfaces — food, exercise, supplements, and any future
      additions. Affects the 7-day rolling math directly.
    </div>

    <div class="card">
      <h3>Day confirmation</h3>
      <p class="card-blurb">
        Vacation, holidays, illness, or a forgotten day all leave gaps
        in your data. Pick how the app should treat those days when
        computing rolling-window math.
      </p>

      <label
        v-for="mode in MODES"
        :key="mode.key"
        class="mode"
        :class="{ active: confirmationMode === mode.key }"
      >
        <input
          type="radio"
          name="confirmation-mode"
          :value="mode.key"
          v-model="confirmationMode"
        />
        <div class="mode-body">
          <div class="mode-head">
            <span class="mode-label">{{ mode.label }}</span>
            <span v-if="mode.badge" class="mode-badge">{{ mode.badge }}</span>
          </div>
          <div class="mode-desc">{{ mode.desc }}</div>
          <div class="mode-best"><strong>Best when:</strong> {{ mode.bestWhen }}</div>
        </div>
      </label>

      <div class="hint">
        Either mode lets you flip individual days from the 7-day strip
        on the Log page — tap any day to override its status.
      </div>
    </div>
  </div>
</template>

<style scoped>
.tracking-page { max-width: 720px; }
.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.back-link { text-decoration: none; color: var(--text-tertiary); font-size: var(--font-size-s); }
.back-link:hover { color: var(--text); }
.page-title {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin: 0;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}
.card h3 {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin: 0 0 var(--space-3);
}
.callout {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.5;
  border-left: 2px solid var(--primary);
}
.card-blurb {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  line-height: 1.5;
}

.mode {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--border);
  margin-bottom: var(--space-2);
  cursor: pointer;
}
.mode:hover { border-color: var(--text-tertiary); }
.mode.active { border-color: var(--primary); background: var(--primary-soft); }
.mode input { margin-top: 4px; }
.mode-body { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.mode-head { display: flex; align-items: baseline; gap: var(--space-2); }
.mode-label {
  font-size: var(--font-size-m);
  font-weight: var(--font-weight-medium);
  color: var(--text);
}
.mode-badge {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--primary);
  font-weight: var(--font-weight-bold);
}
.mode-desc {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  line-height: 1.5;
}
.mode-best {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.hint {
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--bg);
  border-left: 2px solid var(--border);
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  line-height: 1.4;
}
</style>
