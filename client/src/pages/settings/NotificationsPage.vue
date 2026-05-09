<script setup>
import { ref, onMounted, computed } from 'vue';
import { useSettingsStore } from '../../stores/settings.js';
import { usePushStore } from '../../stores/push.js';
import { usePwa } from '../../composables/usePwa.js';
import InstallInstructions from '../../components/InstallInstructions.vue';

const store = useSettingsStore();
const pushStore = usePushStore();
const pwa = usePwa();

const trackReminderEnabled = ref(false);
const trackReminderTime = ref('20:00');
const notificationError = ref('');
const notificationSaving = ref(false);
const testSending = ref(false);
const testStatus = ref(''); // 'ok' | 'err' | ''

const notificationsBlockedByIos = computed(
  () => pwa.platform.value === 'ios' && !pwa.installed.value,
);

async function toggleNotifications() {
  notificationError.value = '';
  if (pushStore.enabled) {
    await pushStore.disable();
  } else {
    const ok = await pushStore.enable();
    if (!ok) notificationError.value = pushStore.error;
  }
}

async function saveTrackReminder() {
  notificationSaving.value = true;
  notificationError.value = '';
  try {
    await store.updateNotifications({
      trackReminder: {
        enabled: trackReminderEnabled.value,
        time: trackReminderTime.value,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  } catch (err) {
    notificationError.value = err.message;
  } finally {
    notificationSaving.value = false;
  }
}

async function toggleCategory(category) {
  if (!pushStore.subscriptionDoc) return;
  const current = pushStore.subscriptionDoc.categories?.[category];
  await pushStore.setCategories({ [category]: !current });
}

async function sendTest() {
  testSending.value = true;
  testStatus.value = '';
  try {
    await pushStore.sendTest();
    testStatus.value = 'ok';
  } catch {
    testStatus.value = 'err';
  } finally {
    testSending.value = false;
    setTimeout(() => { testStatus.value = ''; }, 2500);
  }
}

onMounted(async () => {
  if (!store.loaded) await store.fetchSettings();
  if (store.settings) {
    trackReminderEnabled.value = Boolean(store.settings.trackReminder?.enabled);
    trackReminderTime.value = store.settings.trackReminder?.time || '20:00';
  }

  pushStore.refreshPermission();
  if (pushStore.supported) {
    await pushStore.fetchVapidKey().catch(() => {});
    await pushStore.loadExistingSubscription();
    if (pushStore.enabled) await pushStore.fetchSubscriptions();
  }
});
</script>

<template>
  <div class="notifications-page">
    <div class="head">
      <router-link to="/profile" class="back-link" aria-label="Back"
        >‹ Profile</router-link
      >
      <h2 class="page-title">Notifications</h2>
    </div>

    <div class="card">
      <div v-if="!pushStore.supported" class="notif-note">
        Push notifications aren't supported in this browser.
      </div>
      <div v-else-if="!pushStore.serverEnabled" class="notif-note">
        Push notifications aren't available right now.
      </div>
      <template v-else>
        <div v-if="!pwa.installed.value" class="notif-install">
          <p class="notif-lead">
            <template v-if="notificationsBlockedByIos">
              On iPhone and iPad, push notifications only work when the app is
              installed to your home screen.
            </template>
            <template v-else>
              Install the app for the most reliable delivery.
            </template>
          </p>
          <InstallInstructions />
        </div>

        <div
          class="notif-hero"
          :class="{ on: pushStore.enabled, blocked: pushStore.permission === 'denied' }"
        >
          <div class="notif-hero-main">
            <span class="notif-hero-ind" />
            <div class="notif-hero-text">
              <div class="notif-hero-state">
                <template v-if="pushStore.enabled"
                  >Active on this device</template
                >
                <template v-else-if="pushStore.permission === 'denied'"
                  >Blocked by browser</template
                >
                <template v-else>Not enabled</template>
              </div>
              <div class="notif-hero-sub">
                <template v-if="pushStore.enabled"
                  >Push reminders will be delivered here.</template
                >
                <template v-else-if="pushStore.permission === 'denied'"
                  >Re-enable notifications in your device settings.</template
                >
                <template v-else
                  >Turn on to receive dose and tracking reminders.</template
                >
              </div>
            </div>
          </div>
          <button
            type="button"
            class="notif-hero-btn"
            :class="{ on: pushStore.enabled }"
            :disabled="pushStore.loading || notificationsBlockedByIos"
            @click="toggleNotifications"
          >
            {{ pushStore.enabled ? 'Turn off' : 'Enable' }}
          </button>
        </div>

        <template v-if="pushStore.enabled">
          <div class="notif-section-label">Categories</div>
          <div class="notif-categories">
            <label class="notif-cat">
              <input
                type="checkbox"
                :checked="pushStore.subscriptionDoc?.categories?.doseReminder !== false"
                @change="toggleCategory('doseReminder')"
              />
              <span>Dose reminders</span>
              <span class="notif-cat-sub"
                >Triggered by each compound's schedule (configure per compound
                under Compounds).</span
              >
            </label>
            <label class="notif-cat">
              <input
                type="checkbox"
                :checked="pushStore.subscriptionDoc?.categories?.trackReminder !== false"
                @change="toggleCategory('trackReminder')"
              />
              <span>Daily tracking reminder</span>
              <span class="notif-cat-sub"
                >Evening nudge if you haven't logged yet.</span
              >
            </label>
            <label class="notif-cat">
              <input
                type="checkbox"
                :checked="pushStore.subscriptionDoc?.categories?.fastingReminder !== false"
                @change="toggleCategory('fastingReminder')"
              />
              <span>Fasting reminders</span>
              <span class="notif-cat-sub"
                >Fast start + complete (configure under Fasting).</span
              >
            </label>
            <label class="notif-cat">
              <input
                type="checkbox"
                :checked="pushStore.subscriptionDoc?.categories?.menstruationReminder !== false"
                @change="toggleCategory('menstruationReminder')"
              />
              <span>Cycle reminders</span>
              <span class="notif-cat-sub"
                >Predicted period, ovulation, etc. (configure under Menstrual cycle).</span
              >
            </label>
          </div>

          <!-- Daily tracking time picker, merged from the old "Daily tracking" card. -->
          <div class="track-row" :class="{ disabled: !pushStore.enabled }">
            <label class="track-toggle">
              <input
                type="checkbox"
                v-model="trackReminderEnabled"
                :disabled="!pushStore.enabled"
              />
              <span>Remind me at</span>
            </label>
            <input
              type="time"
              v-model="trackReminderTime"
              :disabled="!trackReminderEnabled || !pushStore.enabled"
              class="track-time"
            />
            <button
              type="button"
              class="btn-secondary sm"
              :disabled="notificationSaving || !pushStore.enabled"
              @click="saveTrackReminder"
            >
              {{ notificationSaving ? 'Saving…' : 'Save' }}
            </button>
          </div>

          <div class="notif-test-row">
            <button
              type="button"
              class="btn-secondary"
              :disabled="testSending"
              @click="sendTest"
            >
              {{ testSending ? 'Sending…' : 'Send test notification' }}
            </button>
            <span v-if="testStatus === 'ok'" class="notif-success"
              >Sent — check your device.</span
            >
            <span v-else-if="testStatus === 'err'" class="notif-err"
              >Failed. Check logs.</span
            >
          </div>
        </template>

        <p v-if="notificationError || pushStore.error" class="error">
          {{ notificationError || pushStore.error }}
        </p>
      </template>
    </div>
  </div>
</template>

<style scoped>
.notifications-page { max-width: 560px; }
.head {
  padding: var(--space-5) var(--space-5) 0;
  margin-bottom: var(--space-4);
}
.back-link {
  display: inline-flex;
  align-items: center;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  text-decoration: none;
  margin-bottom: var(--space-2);
  padding: var(--space-1) 0;
}
.back-link:hover { color: var(--text); }

.page-title { margin: 0; text-align: center; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
}

.notif-note {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  padding: var(--space-2) 0;
}
.notif-install {
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-3);
  border-bottom: 1px dashed var(--border);
}
.notif-lead { margin: 0 0 var(--space-2); font-size: var(--font-size-s); color: var(--text); }

.notif-hero {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-4);
  background: var(--bg);
  border: 1px solid var(--border);
  border-left: 3px solid var(--border-strong);
  margin-bottom: var(--space-4);
}
.notif-hero.on { border-left-color: var(--primary); }
.notif-hero.blocked { border-left-color: var(--danger); }
.notif-hero-main { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.notif-hero-ind {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-strong);
  flex: none;
  box-shadow: 0 0 0 3px var(--bg);
}
.notif-hero.on .notif-hero-ind {
  background: var(--success);
  box-shadow: 0 0 0 3px var(--primary-soft);
}
.notif-hero.blocked .notif-hero-ind { background: var(--danger); }
.notif-hero-text { min-width: 0; }
.notif-hero-state {
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  letter-spacing: var(--tracking-tight);
}
.notif-hero-sub {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  margin-top: 2px;
}
.notif-hero-btn {
  padding: 0.45rem 1rem;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  font-size: var(--font-size-s);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.notif-hero-btn:hover { border-color: var(--text-secondary); }
.notif-hero-btn.on {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--text-on-primary);
}
.notif-hero-btn.on:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
.notif-hero-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.notif-section-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  color: var(--text-tertiary);
  margin-bottom: var(--space-2);
}
.notif-categories {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.notif-cat {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: baseline;
  gap: 2px var(--space-2);
  font-size: var(--font-size-s);
  color: var(--text);
  cursor: pointer;
}
.notif-cat input[type="checkbox"] { grid-row: 1 / span 2; align-self: start; margin-top: 3px; accent-color: var(--primary); }
.notif-cat-sub { grid-column: 2; font-size: var(--font-size-xs); color: var(--text-tertiary); }

.track-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding: var(--space-3);
  background: var(--bg);
  border: 1px solid var(--border);
  margin-bottom: var(--space-4);
  transition: opacity var(--transition-fast);
}
.track-row.disabled { opacity: 0.55; }
.track-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-s);
  color: var(--text);
  cursor: pointer;
}
.track-toggle input { accent-color: var(--primary); }
.track-time {
  padding: 0.3rem 0.5rem;
  font-size: var(--font-size-s);
  font-variant-numeric: tabular-nums;
}
.track-time:disabled { opacity: 0.5; }

.notif-test-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--border);
  flex-wrap: wrap;
}
.notif-success { color: var(--success); font-size: var(--font-size-s); }
.notif-err { color: var(--danger); font-size: var(--font-size-s); }
.error { color: var(--danger); font-size: var(--font-size-s); margin-bottom: 0.5rem; }
</style>
