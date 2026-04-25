<script setup>
// Stop-the-world upgrade modal. Mounted once in App.vue; opens whenever
// useUpgradeModalStore.isOpen flips. Renders the denial reason + a CTA
// that routes to /pricing (or starts checkout if user is already authed).

import { computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUpgradeModalStore } from '../stores/upgradeModal.js';

const modal = useUpgradeModalStore();
const router = useRouter();

const denial = computed(() => modal.denial);

const title = computed(() => {
  if (!denial.value) return '';
  if (denial.value.upgradePlan) {
    return `Upgrade to ${denial.value.upgradePlan.marketing.title}`;
  }
  return 'Plan limit reached';
});

const subtitle = computed(() => {
  if (!denial.value) return '';
  if (denial.value.message) return denial.value.message;

  const { limitKey, limit, used, upgradePlan } = denial.value;
  if (limitKey && limit != null) {
    const target = upgradePlan ? upgradePlan.marketing.title : 'a higher tier';
    return `Your current plan allows ${limit}${used != null ? `, you have ${used}` : ''}. Upgrade to ${target} for more.`;
  }
  return upgradePlan
    ? `This feature is included in ${upgradePlan.marketing.title}.`
    : 'This feature is not available on your current plan.';
});

const ctaLabel = computed(() => {
  const t = denial.value?.upgradePlan;
  return t ? `See ${t.marketing.title} pricing` : 'See pricing';
});

function onClose() {
  modal.close();
}

function onUpgrade() {
  modal.close();
  router.push('/pricing');
}

// Close on Escape.
watch(
  () => modal.isOpen,
  (open) => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const stop = watch(
      () => modal.isOpen,
      (v) => {
        if (!v) {
          window.removeEventListener('keydown', onKey);
          stop();
        }
      },
    );
  },
);
</script>

<template>
  <Teleport to="body">
    <div v-if="modal.isOpen" class="ug-overlay" role="dialog" aria-modal="true" @click.self="onClose">
      <div class="ug-card">
        <h3 class="ug-title">{{ title }}</h3>
        <p class="ug-sub">{{ subtitle }}</p>

        <ul v-if="denial?.upgradePlan?.marketing?.featureList?.length" class="ug-feats">
          <li v-for="(f, i) in denial.upgradePlan.marketing.featureList.slice(0, 4)" :key="i">{{ f }}</li>
        </ul>

        <div class="ug-actions">
          <button type="button" class="ug-btn-secondary" @click="onClose">Not now</button>
          <button type="button" class="ug-btn-primary" @click="onUpgrade">{{ ctaLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ug-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}
.ug-card {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  max-width: 440px;
  width: 100%;
  padding: 28px 28px 22px;
}
.ug-title {
  font-family: var(--font-display, inherit);
  font-size: 22px;
  margin: 0 0 8px;
  letter-spacing: -0.01em;
}
.ug-sub {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 18px;
  line-height: 1.5;
}
.ug-feats {
  list-style: none;
  padding: 0;
  margin: 0 0 22px;
  font-size: 13px;
  color: var(--text-secondary);
}
.ug-feats li {
  padding: 4px 0 4px 18px;
  position: relative;
}
.ug-feats li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
}
.ug-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
.ug-btn-secondary,
.ug-btn-primary {
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 0.06em;
  padding: 10px 18px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.ug-btn-primary {
  background: var(--primary);
  color: var(--bg);
  border-color: var(--primary);
}
.ug-btn-secondary:hover { border-color: var(--border-strong); }
.ug-btn-primary:hover { filter: brightness(1.05); }
</style>
