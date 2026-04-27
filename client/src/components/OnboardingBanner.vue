<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePwa } from '../composables/usePwa.js';
import { usePushStore } from '../stores/push.js';
import { useOnboardingStore } from '../stores/onboarding.js';
import { useDemoStore } from '../stores/demo.js';

const pwa = usePwa();
const pushStore = usePushStore();
const onboarding = useOnboardingStore();
const demo = useDemoStore();
const router = useRouter();

// The banner shows the single highest-priority incomplete onboarding action
// so users don't scroll past it. More detailed guidance lives in the
// dashboard checklist + settings page.
const step = computed(() => {
  // Demo sessions never see install/notification nudges — sandboxes can't
  // receive push and the demo's whole purpose is "feel the product first."
  if (demo.inDemo) return null;
  if (onboarding.bannerDismissed) return null;
  if (!pwa.installed.value) {
    return {
      id: 'install',
      text: 'Install Protokol Lab to enable reminders and faster launch.',
      cta: 'Show me how',
    };
  }
  if (pushStore.supported && !pushStore.enabled && pushStore.permission !== 'denied') {
    return {
      id: 'notifications',
      text: 'Turn on reminders so you never miss a dose.',
      cta: 'Enable',
    };
  }
  return null;
});

async function onCta() {
  if (step.value?.id === 'notifications') {
    const ok = await pushStore.enable();
    if (!ok && pushStore.permission === 'denied') {
      router.push('/settings');
    }
  } else {
    router.push('/dashboard');
  }
}

function dismiss() {
  onboarding.dismissBanner();
}
</script>

<template>
  <div
    v-if="step"
    class="onboarding-banner"
    role="region"
    aria-label="Setup reminder"
  >
    <span class="ob-text">{{ step.text }}</span>
    <button type="button" class="ob-cta" @click="onCta">{{ step.cta }}</button>
    <button
      type="button"
      class="ob-dismiss"
      @click="dismiss"
      aria-label="Dismiss"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.onboarding-banner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--primary-soft, var(--surface));
  border-bottom: 1px solid var(--primary, var(--border));
  color: var(--text);
  font-size: var(--font-size-s);
}
.ob-text { flex: 1; min-width: 0; }
.ob-cta {
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: var(--radius-small);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  flex: none;
}
.ob-cta:hover { background: var(--primary-hover); }
.ob-dismiss {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-l);
  line-height: 1;
  padding: 0 var(--space-1);
  cursor: pointer;
}
.ob-dismiss:hover { color: var(--text); }

@media (max-width: 520px) {
  .onboarding-banner { font-size: var(--font-size-xs); padding: var(--space-1) var(--space-3); gap: var(--space-1); }
  .ob-cta { font-size: var(--font-size-xs); padding: var(--space-1) var(--space-2); }
}
</style>
