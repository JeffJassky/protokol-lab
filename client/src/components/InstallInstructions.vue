<script setup>
import { computed } from 'vue';
import { usePwa } from '../composables/usePwa.js';

const pwa = usePwa();

const step = computed(() => {
  if (pwa.installed.value) return 'installed';
  if (pwa.installBlockedByNonSafariIos.value) return 'ios-not-safari';
  if (pwa.needsIosInstallInstructions.value) return 'ios-safari';
  if (pwa.canPromptInstall.value) return 'prompt';
  return 'other';
});

async function handleInstall() {
  await pwa.promptInstall();
}
</script>

<template>
  <div class="install-instructions">
    <div v-if="step === 'installed'" class="state ok">
      <span class="check">✓</span> App is installed on this device.
    </div>

    <div v-else-if="step === 'prompt'" class="state">
      <p class="lead">
        Install Protokol Lab for faster launch + reliable reminders.
      </p>
      <button class="btn-primary" type="button" @click="handleInstall">
        Install app
      </button>
    </div>

    <div v-else-if="step === 'ios-safari'" class="state">
      <p class="lead">Add Protokol Lab to your home screen:</p>
      <ol class="ios-steps">
        <li>
          <span class="ios-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path
                fill="currentColor"
                d="M12 2 7 7h3v7h4V7h3l-5-5Zm-7 18h14v2H5v-2Zm0-4h14v2H5v-2Z"
              />
            </svg>
          </span>
          Tap the <strong>Share</strong> button at the bottom of Safari.
        </li>
        <li>Scroll and choose <strong>Add to Home Screen</strong>.</li>
        <li>
          Tap <strong>Add</strong>, then open the new icon from your home
          screen.
        </li>
      </ol>
      <p class="note">
        Push notifications work only when opened from the home-screen icon.
      </p>
    </div>

    <div v-else-if="step === 'ios-not-safari'" class="state warn">
      <p class="lead">
        On iOS, installing a PWA requires <strong>Safari</strong>.
      </p>
      <p class="note">
        Open this page in Safari, then tap Share → Add to Home Screen.
      </p>
    </div>

    <div v-else class="state">
      <p class="lead">
        Look for the <strong>Install</strong> option in your browser menu.
      </p>
      <p class="note">
        Chrome / Edge: address bar install icon · Firefox Android: menu →
        Install.
      </p>
    </div>
  </div>
</template>

<style scoped>
.install-instructions { font-size: var(--font-size-s); color: var(--text); }
.lead { margin: 0 0 var(--space-2); }
.note { margin: var(--space-1) 0 0; font-size: var(--font-size-xs); color: var(--text-secondary); }

.state {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-3) var(--space-4);
}
.state.ok {
  background: var(--success-soft, var(--bg));
  border-color: var(--success, var(--border));
  color: var(--success, var(--text));
}
.state.warn {
  border-color: var(--warning, var(--border));
  color: var(--warning, var(--text));
}
.check { font-weight: var(--font-weight-bold); margin-right: var(--space-1); }

.ios-steps {
  margin: 0;
  padding-left: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  color: var(--text);
}
.ios-steps li {
  line-height: 1.4;
}
.ios-icon {
  display: inline-flex;
  align-items: center;
  vertical-align: -5px;
  color: var(--primary);
  margin-right: var(--space-1);
}
</style>
