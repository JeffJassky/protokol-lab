<script setup>
// Small inline badge advertising a tier requirement, e.g. "(Premium)".
// Usage:
//   <UpgradeBadge tier="premium" />
//   <UpgradeBadge label="Upgrade" />          ← generic
//   <UpgradeBadge tier="premium" clickable />  ← opens upgrade modal on click
//
// Pass `tier` to derive label from PLANS[tier].title; or `label` for custom
// text. When clickable, click pops the global upgrade modal.

import { computed } from 'vue';
import { PLANS } from '../../../shared/plans.js';
import { useUpgradeModalStore } from '../stores/upgradeModal.js';

const props = defineProps({
  tier: { type: String, default: null },
  label: { type: String, default: null },
  clickable: { type: Boolean, default: false },
  // Optional pre-flight context if clickable opens a gate vs a generic upsell.
  limitKey: { type: String, default: null },
  featureKey: { type: String, default: null },
});

const text = computed(() => {
  if (props.label) return props.label;
  if (props.tier && PLANS[props.tier]) return PLANS[props.tier].marketing.title;
  return 'Upgrade';
});

// Tier → CSS var. Plans.js exposes `marketing.highlightColor` like
// "var(--green)" but those tokens aren't defined, so map directly.
const TIER_ACCENT = {
  premium: 'var(--primary)',
  unlimited: 'var(--color-carbs)',
};
const accentStyle = computed(() => {
  if (!props.tier) return null;
  const color = TIER_ACCENT[props.tier];
  return color ? { '--badge-accent': color } : null;
});

const modal = useUpgradeModalStore();

function onClick() {
  if (!props.clickable) return;
  modal.openForGate({
    limitKey: props.limitKey,
    featureKey: props.featureKey,
  });
}
</script>

<template>
  <component
    :is="clickable ? 'button' : 'span'"
    :type="clickable ? 'button' : undefined"
    class="upgrade-badge"
    :class="[tier ? `tier-${tier}` : 'tier-generic', { clickable }]"
    :style="accentStyle"
    @click="onClick"
  >{{ text }}</component>
</template>

<style scoped>
.upgrade-badge {
  --badge-accent: var(--text-tertiary);
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--badge-accent);
  background: transparent;
  border: 1px solid var(--badge-accent);
  border-radius: 999px;
  padding: 2px 8px 1px;
  margin-left: 8px;
  font-family: inherit;
  line-height: 1.4;
  vertical-align: middle;
  white-space: nowrap;
}
.upgrade-badge.clickable {
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.upgrade-badge.clickable:hover {
  background: var(--badge-accent);
  color: var(--bg);
}
</style>
