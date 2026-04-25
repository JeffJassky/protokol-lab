<script setup>
import { usePwa } from '../../composables/usePwa.js';
import InstallInstructions from '../InstallInstructions.vue';

const pwa = usePwa();

async function promptInstall() {
  await pwa.promptInstall();
}
</script>

<template>
  <div class="step">
    <h2>Install the app</h2>
    <p class="lede">
      Adding to your home screen makes the app launch faster and — on iOS —
      is required for push notifications.
    </p>

    <div v-if="pwa.installed.value" class="ok">
      <span class="ok-mark">✓</span> Installed on this device.
    </div>

    <template v-else>
      <button
        v-if="pwa.canPromptInstall.value"
        type="button"
        class="btn-primary big"
        @click="promptInstall"
      >
        Install Protokol Lab
      </button>

      <InstallInstructions v-else class="instr" />
    </template>
  </div>
</template>

<style scoped>
.step h2 { margin: 0 0 var(--space-1); font-size: var(--font-size-xl); }
.lede { margin: 0 0 var(--space-4); color: var(--text-secondary); font-size: var(--font-size-s); }
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
.instr { margin-top: 0; }
</style>
