<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePwa } from '../composables/usePwa.js';
import { usePushStore } from '../stores/push.js';
import { useOnboardingStore } from '../stores/onboarding.js';

const pwa = usePwa();
const pushStore = usePushStore();
const onboarding = useOnboardingStore();
const router = useRouter();

// The banner shows the single highest-priority incomplete onboarding action
// so users don't scroll past it. More detailed guidance lives in the
// dashboard checklist + settings page.
const step = computed(() => {
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
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  background: var(--primary-soft, var(--surface));
  border-bottom: 1px solid var(--primary, var(--border));
  color: var(--text);
  font-size: 0.85rem;
}
.ob-text { flex: 1; min-width: 0; }
.ob-cta {
  background: var(--primary);
  color: var(--text-on-primary);
  border: none;
  border-radius: 6px;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  flex: none;
}
.ob-cta:hover { background: var(--primary-hover); }
.ob-dismiss {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.2rem;
  line-height: 1;
  padding: 0 0.3rem;
  cursor: pointer;
}
.ob-dismiss:hover { color: var(--text); }

@media (max-width: 520px) {
  .onboarding-banner { font-size: 0.78rem; padding: 0.4rem 0.75rem; gap: 0.4rem; }
  .ob-cta { font-size: 0.75rem; padding: 0.25rem 0.55rem; }
}
</style>
