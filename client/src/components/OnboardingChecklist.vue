<script setup>
import { computed, onMounted, ref } from 'vue';
import { usePwa } from '../composables/usePwa.js';
import { usePushStore } from '../stores/push.js';
import { useOnboardingStore } from '../stores/onboarding.js';
import { useAuthStore } from '../stores/auth.js';
import { useDemoStore } from '../stores/demo.js';
import InstallInstructions from './InstallInstructions.vue';

const pwa = usePwa();
const pushStore = usePushStore();
const onboarding = useOnboardingStore();
const auth = useAuthStore();
const demo = useDemoStore();

const expanded = ref('install'); // id of the currently expanded step

const steps = computed(() => {
  const list = [];

  // Skip the install step on desktop if we have no install prompt available —
  // most desktops don't need a PWA install for notifications anyway.
  const showInstall = pwa.platform.value !== 'desktop' || pwa.canPromptInstall.value || !pwa.installed.value;
  if (showInstall) {
    list.push({
      id: 'install',
      title: 'Install the app',
      summary: pwa.installed.value ? 'Installed on this device.' : 'Add Protokol Lab to your home screen.',
      done: pwa.installed.value,
    });
  }

  // On iOS, blocking notification step until installed avoids a wasted prompt
  // that would otherwise permanently deny permission.
  const notifsBlocked = pwa.platform.value === 'ios' && !pwa.installed.value;
  list.push({
    id: 'notifications',
    title: 'Enable reminders',
    summary: pushStore.enabled
      ? 'Notifications are on.'
      : notifsBlocked
      ? 'Install the app first, then come back.'
      : 'Get alerts for doses and daily tracking.',
    done: pushStore.enabled,
    blocked: notifsBlocked && !pushStore.enabled,
  });

  return list;
});

const allDone = computed(() => steps.value.every((s) => s.done));
const incomplete = computed(() => steps.value.filter((s) => !s.done));
// Baseline of 75% — by the time the user sees this checklist they've already
// signed up, set up their profile, and started using the app. Showing 0%
// feels demotivating. Each remaining step contributes the rest of the bar
// equally so it always lands on 100% when all done, regardless of step count.
const PROGRESS_BASELINE = 75;
const progress = computed(() => {
  const total = steps.value.length;
  if (!total) return 100;
  const done = steps.value.filter((s) => s.done).length;
  const earned = (done / total) * (100 - PROGRESS_BASELINE);
  return PROGRESS_BASELINE + earned;
});

function toggle(id) {
  expanded.value = expanded.value === id ? null : id;
}

async function enableNotifications() {
  const ok = await pushStore.enable();
  if (ok) onboarding.markNotificationPromptShown();
}

onMounted(async () => {
  if (auth.user?._id || auth.user?.id) {
    onboarding.hydrate(String(auth.user._id || auth.user.id));
  }
  pushStore.refreshPermission();
  if (pushStore.supported) {
    await pushStore.loadExistingSubscription();
    if (pushStore.enabled) await pushStore.fetchSubscriptions();
  }
  // Auto-open the first incomplete step so the user sees what to do next.
  const firstIncomplete = steps.value.find((s) => !s.done);
  if (firstIncomplete) expanded.value = firstIncomplete.id;
});

// The checklist is persistent until every step is genuinely complete — no
// dismiss / show-again. Setup is short enough that letting the user hide it
// just makes them lose track and never enable reminders.
// Demo sandboxes can't install or receive push, so the checklist is
// pointless there and just clutters the demo experience.
const visible = computed(() => !demo.inDemo && !allDone.value);
</script>

<template>
  <section v-if="visible" class="onboarding-card">
    <header class="oc-header">
      <h3>Finish setup</h3>
    </header>

    <div
      class="oc-progress-track"
      role="progressbar"
      :aria-valuenow="Math.round(progress)"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="oc-progress-fill" :style="{ width: progress + '%' }" />
    </div>

    <ul class="oc-steps">
      <li
        v-for="s in steps"
        :key="s.id"
        class="oc-step"
        :class="{ done: s.done, expanded: expanded === s.id, blocked: s.blocked }"
      >
        <button type="button" class="oc-step-head" @click="toggle(s.id)">
          <span class="oc-step-check" :class="{ done: s.done }">
            <template v-if="s.done">✓</template>
            <template
              v-else
              >{{ steps.findIndex(x => x.id === s.id) + 1 }}</template
            >
          </span>
          <span class="oc-step-title">{{ s.title }}</span>
          <span class="oc-step-summary">{{ s.summary }}</span>
          <span class="oc-step-chevron" :class="{ open: expanded === s.id }"
            >▾</span
          >
        </button>

        <div v-if="expanded === s.id" class="oc-step-body">
          <div v-if="s.id === 'install'">
            <InstallInstructions />
          </div>

          <div v-else-if="s.id === 'notifications'">
            <p v-if="!pushStore.supported" class="oc-note">
              Push notifications aren't supported in this browser.
            </p>
            <p v-else-if="s.blocked" class="oc-note warn">
              iOS only delivers push notifications to installed PWAs — install
              first, then this unlocks.
            </p>
            <template v-else-if="pushStore.enabled">
              <p class="oc-note ok">
                Notifications are enabled on this device.
              </p>
            </template>
            <template v-else-if="pushStore.permission === 'denied'">
              <p class="oc-note warn">
                Notifications are blocked for this site. On iOS: Settings →
                Notifications → Protokol Lab → Allow. Elsewhere: click the lock
                icon in the address bar → Notifications → Allow.
              </p>
            </template>
            <template v-else>
              <p class="oc-lead">
                Get a nudge when it's time for your next dose or a daily
                tracking reminder.
              </p>
              <div class="oc-actions">
                <button
                  type="button"
                  class="btn-primary"
                  :disabled="pushStore.loading"
                  @click="enableNotifications"
                >
                  {{ pushStore.loading ? 'Enabling…' : 'Enable reminders' }}
                </button>
                <router-link to="/profile/settings/notifications" class="oc-skip"
                  >Manage later in Settings</router-link
                >
              </div>
              <p v-if="pushStore.error" class="oc-note warn">
                {{ pushStore.error }}
              </p>
            </template>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="incomplete.length === 0" class="oc-allset">
      All set — reminders will fire on your schedule.
    </p>
  </section>
</template>

<style scoped>
.onboarding-card {
  background: linear-gradient(180deg, var(--primary-soft, var(--surface)) 0%, var(--surface) 40%);
  border: 1px solid var(--primary, var(--border));
  border-radius: var(--radius-medium);
  padding: var(--space-4) var(--space-4) var(--space-3);
  margin-bottom: var(--space-4);
  box-shadow: var(--shadow-s);
}

.oc-header {
  margin-bottom: var(--space-2);
}
.oc-header h3 {
  font-size: var(--font-size-m);
  margin: 0;
  color: var(--text);
  font-weight: var(--font-weight-bold);
}
.oc-progress-track {
  height: 4px;
  background: var(--border);
  border-radius: var(--radius-small);
  overflow: hidden;
  margin-bottom: var(--space-3);
}
.oc-progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.35s ease;
}

.oc-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.oc-step {
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  background: var(--bg);
  overflow: hidden;
  transition: border-color var(--transition-fast);
}
.oc-step.done { opacity: 0.82; }
.oc-step.expanded { border-color: var(--primary); }
.oc-step.blocked .oc-step-title { color: var(--text-secondary); }

.oc-step-head {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  grid-template-areas:
    "check title chevron"
    "check summary chevron";
  width: 100%;
  gap: 0 var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--text);
}
.oc-step-check {
  grid-area: check;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  background: var(--surface);
  border: 2px solid var(--border);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}
.oc-step-check.done {
  background: var(--success, var(--primary));
  border-color: var(--success, var(--primary));
  color: var(--text-on-primary);
}
.oc-step-title { grid-area: title; font-weight: var(--font-weight-medium); font-size: var(--font-size-s); }
.oc-step-summary {
  grid-area: summary;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  line-height: 1.3;
}
.oc-step-chevron {
  grid-area: chevron;
  color: var(--text-secondary);
  transition: transform var(--transition-base);
  font-size: var(--font-size-m);
  align-self: center;
}
.oc-step-chevron.open { transform: rotate(180deg); }

.oc-step-body {
  padding: 0 var(--space-3) var(--space-3);
  border-top: 1px solid var(--border);
  padding-top: var(--space-2);
  background: var(--bg);
}
.oc-lead { margin: 0 0 var(--space-2); font-size: var(--font-size-s); color: var(--text); }
.oc-actions { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.oc-skip {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  text-decoration: none;
}
.oc-skip:hover { color: var(--text); text-decoration: underline; }

.oc-note { margin: var(--space-1) 0 0; font-size: var(--font-size-xs); color: var(--text-secondary); }
.oc-note.warn { color: var(--warning, var(--text-secondary)); }
.oc-note.ok { color: var(--success, var(--text-secondary)); }

.oc-allset {
  margin: var(--space-2) 0 var(--space-1);
  font-size: var(--font-size-s);
  color: var(--success, var(--text-secondary));
  text-align: center;
}
</style>
