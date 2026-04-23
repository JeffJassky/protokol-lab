<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { usePwa } from '../composables/usePwa.js';
import { usePushStore } from '../stores/push.js';
import { useOnboardingStore } from '../stores/onboarding.js';
import { useAuthStore } from '../stores/auth.js';
import InstallInstructions from './InstallInstructions.vue';

const pwa = usePwa();
const pushStore = usePushStore();
const onboarding = useOnboardingStore();
const auth = useAuthStore();

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
const progress = computed(() => {
  const total = steps.value.length;
  if (!total) return 0;
  return Math.round((steps.value.filter((s) => s.done).length / total) * 100);
});

function toggle(id) {
  expanded.value = expanded.value === id ? null : id;
}

async function enableNotifications() {
  const ok = await pushStore.enable();
  if (ok) onboarding.markNotificationPromptShown();
}

function dismiss() {
  onboarding.dismissChecklist();
}

function restore() {
  onboarding.restoreChecklist();
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

watch(() => onboarding.shouldRestoreAfterCooldown, (v) => {
  if (v && !allDone.value) onboarding.restoreChecklist();
});

const visible = computed(() => {
  if (allDone.value) return false;
  if (onboarding.state.checklistDismissed && !onboarding.shouldRestoreAfterCooldown) return false;
  return true;
});
</script>

<template>
  <section v-if="visible" class="onboarding-card">
    <header class="oc-header">
      <div class="oc-head-left">
        <h3>Finish setup</h3>
        <span class="oc-progress-text">{{ progress }}% complete</span>
      </div>
      <button
        type="button"
        class="oc-dismiss"
        @click="dismiss"
        title="Remind me later"
      >
        ×
      </button>
    </header>

    <div class="oc-progress-track" aria-hidden="true">
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
                <router-link to="/settings" class="oc-skip"
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

  <button
    v-else-if="onboarding.state.checklistDismissed && !allDone"
    type="button"
    class="oc-restore"
    @click="restore"
  >
    Show setup checklist
  </button>
</template>

<style scoped>
.onboarding-card {
  background: linear-gradient(180deg, var(--primary-soft, var(--surface)) 0%, var(--surface) 40%);
  border: 1px solid var(--primary, var(--border));
  border-radius: 12px;
  padding: 1rem 1rem 0.75rem;
  margin-bottom: 1rem;
  box-shadow: var(--shadow-s);
}

.oc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.oc-head-left { display: flex; flex-direction: column; gap: 0.15rem; }
.oc-header h3 {
  font-size: 0.95rem;
  margin: 0;
  color: var(--text);
  font-weight: 600;
}
.oc-progress-text {
  font-size: 0.72rem;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}
.oc-dismiss {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.3rem;
}
.oc-dismiss:hover { color: var(--text); }

.oc-progress-track {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}
.oc-progress-fill {
  height: 100%;
  background: var(--primary);
  transition: width 0.35s ease;
}

.oc-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.oc-step {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  overflow: hidden;
  transition: border-color 0.1s;
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
  gap: 0 0.6rem;
  align-items: center;
  padding: 0.65rem 0.8rem;
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
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--border);
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 600;
}
.oc-step-check.done {
  background: var(--success, var(--primary));
  border-color: var(--success, var(--primary));
  color: var(--text-on-primary);
}
.oc-step-title { grid-area: title; font-weight: 500; font-size: 0.9rem; }
.oc-step-summary {
  grid-area: summary;
  font-size: 0.76rem;
  color: var(--text-secondary);
  line-height: 1.3;
}
.oc-step-chevron {
  grid-area: chevron;
  color: var(--text-secondary);
  transition: transform 0.15s;
  font-size: 1rem;
  align-self: center;
}
.oc-step-chevron.open { transform: rotate(180deg); }

.oc-step-body {
  padding: 0 0.8rem 0.75rem;
  border-top: 1px solid var(--border);
  padding-top: 0.65rem;
  background: var(--bg);
}
.oc-lead { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--text); }
.oc-actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.oc-skip {
  font-size: 0.78rem;
  color: var(--text-secondary);
  text-decoration: none;
}
.oc-skip:hover { color: var(--text); text-decoration: underline; }

.oc-note { margin: 0.45rem 0 0; font-size: 0.78rem; color: var(--text-secondary); }
.oc-note.warn { color: var(--warning, var(--text-secondary)); }
.oc-note.ok { color: var(--success, var(--text-secondary)); }

.oc-allset {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.82rem;
  color: var(--success, var(--text-secondary));
  text-align: center;
}

.btn-primary {
  padding: 0.45rem 1rem;
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
}
.btn-primary:hover { background: var(--primary-hover); }
.btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }

.oc-restore {
  background: var(--bg);
  border: 1px dashed var(--border);
  color: var(--text-secondary);
  border-radius: 8px;
  padding: 0.4rem 0.8rem;
  font-size: 0.78rem;
  cursor: pointer;
  margin-bottom: 1rem;
}
.oc-restore:hover { color: var(--text); border-color: var(--text-secondary); }
</style>
