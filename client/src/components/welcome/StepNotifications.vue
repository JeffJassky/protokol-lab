<script setup>
import { computed, onMounted, ref } from 'vue';
import { usePushStore } from '../../stores/push.js';
import { usePwa } from '../../composables/usePwa.js';

const pushStore = usePushStore();
const pwa = usePwa();
const error = ref('');

const blockedByIos = computed(
  () => pwa.platform.value === 'ios' && !pwa.installed.value,
);

onMounted(async () => {
  pushStore.refreshPermission();
  if (pushStore.supported) await pushStore.loadExistingSubscription();
});

async function enable() {
  error.value = '';
  try {
    await pushStore.enable();
  } catch (err) {
    error.value = err.message || 'Could not enable notifications.';
  }
}
</script>

<template>
  <div class="step">
    <h2>Enable reminders</h2>
    <p class="lede">
      Optional. Get a nudge when it's time for your next dose or your daily
      tracking reminder.
    </p>

    <div v-if="!pushStore.supported" class="note">
      Push notifications aren't supported in this browser.
    </div>

    <div v-else-if="blockedByIos" class="note warn">
      iOS only delivers notifications to installed PWAs. Install the app on the
      previous step, then come back to enable.
    </div>

    <div v-else-if="pushStore.enabled" class="ok">
      <span class="ok-mark">✓</span> Notifications are on for this device.
    </div>

    <div v-else-if="pushStore.permission === 'denied'" class="note warn">
      Notifications are blocked for this site. On iOS: Settings → Notifications
      → Protokol Lab → Allow. On desktop: click the lock icon in the address
      bar and allow notifications.
    </div>

    <button
      v-else
      type="button"
      class="btn-primary big"
      :disabled="pushStore.loading"
      @click="enable"
    >
      {{ pushStore.loading ? 'Enabling…' : 'Turn on reminders' }}
    </button>

    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.step h2 { margin: 0 0 var(--space-1); font-size: var(--font-size-xl); }
.lede { margin: 0 0 var(--space-4); color: var(--text-secondary); font-size: var(--font-size-s); }
.note {
  background: var(--surface);
  border: 1px solid var(--border);
  padding: var(--space-3);
  border-radius: var(--radius-medium);
  font-size: var(--font-size-s);
  color: var(--text-secondary);
}
.note.warn { border-color: var(--warning, var(--border)); color: var(--warning, var(--text)); }
.ok {
  background: var(--surface);
  border: 1px solid var(--success, var(--border));
  color: var(--success, var(--text));
  padding: var(--space-3);
  border-radius: var(--radius-medium);
  font-size: var(--font-size-s);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.ok-mark { font-size: var(--font-size-l); }
.btn-primary.big {
  width: 100%;
  padding: 0.85rem;
  font-size: var(--font-size-m);
}
.error {
  margin-top: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--danger, var(--text-secondary));
}
</style>
