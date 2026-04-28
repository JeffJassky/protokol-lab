<script setup>
// Renders the right banner state for the visitor's session:
//
//   anon, expanded:   full top banner — primary "Set Up My Profile" + "Keep Exploring"
//   anon, collapsed:  corner badge — "Demo · Set Up Profile"
//   none:             hidden
//
// Demo is pre-register only — authed sessions never see a banner here.
// PRD §6.4 / docs/blog/customer-journey.md.

import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useDemoStore } from '../stores/demo.js';

const demo = useDemoStore();
const router = useRouter();

// Banner copy is built from the live template metadata so it reflects the
// founder's current protocol — not a hardcoded list that goes stale every
// time the source data changes.
const bannerMeta = computed(() => {
  const t = demo.template;
  const name = t?.displayName || 'Jeff';
  const days = t?.dayCount;
  const compounds = (t?.compoundNames || []).slice(0, 3);
  const parts = [];
  if (days) parts.push(`${days} days`);
  if (compounds.length) parts.push(compounds.join(' + '));
  return {
    title: `Previewing ${name}'s profile`,
    meta: parts.join(' · '),
  };
});

const state = computed(() => {
  if (demo.mode !== 'anon') return 'hidden';
  return demo.banner.collapsed ? 'anon-collapsed' : 'anon-expanded';
});

function setUpProfile() {
  router.push('/start');
}

function collapse() { demo.collapseBanner(); }
function expand() { demo.expandBanner(); }
</script>

<template>
  <div v-if="state === 'anon-expanded'" class="banner full" role="status">
    <div class="banner-inner">
      <div class="banner-text">
        <strong>{{ bannerMeta.title }}</strong>
        <span v-if="bannerMeta.meta" class="meta">{{ bannerMeta.meta }}</span>
      </div>
      <div class="banner-ctas">
        <button class="btn primary" @click="setUpProfile">
          Set Up My Profile
        </button>
        <button class="btn secondary" @click="collapse">
          Keep Exploring
        </button>
      </div>
    </div>
  </div>

  <div v-else-if="state === 'anon-collapsed'" class="badge anon">
    <button
      class="badge-btn primary-cta"
      type="button"
      @click="setUpProfile"
    >
      <span class="badge-label">Demo</span>
      <span class="badge-cta">Set Up Profile →</span>
    </button>
    <button
      class="badge-expand"
      type="button"
      :title="'Show full banner'"
      @click="expand"
    >
      ↑
    </button>
  </div>
</template>

<style scoped>
/* ── Full banner (anon expanded) ─────────────────────────────────────── */
.banner.full {
  position: sticky;
  top: 0;
  z-index: 90;
  background: var(--primary-soft, #fef3c7);
  border-bottom: 1px solid var(--primary, #f59e0b);
  color: var(--text);
  padding: var(--space-3, 12px) var(--space-6, 24px);
}
.banner-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4, 16px);
  max-width: 1200px;
  margin: 0 auto;
  flex-wrap: wrap;
}
.banner-text { display: flex; flex-direction: column; gap: 2px; }
.banner-text strong { font-size: var(--font-size-s, 14px); }
.meta {
  font-size: var(--font-size-xs, 12px);
  color: var(--text-secondary, #6b7280);
}
.caveat { font-style: italic; }
.banner-ctas { display: flex; gap: var(--space-2, 8px); }

/* ── Corner badge (collapsed states) ────────────────────────────────── */
.badge {
  position: fixed;
  bottom: var(--space-4, 16px);
  left: var(--space-4, 16px);
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: var(--radius-pill, 9999px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  font-size: var(--font-size-xs, 12px);
  color: var(--text);
  cursor: pointer;
}
.badge.anon { background: var(--primary-soft, #fef3c7); border-color: var(--primary, #f59e0b); }
.badge-label { font-weight: var(--font-weight-medium, 500); }
.badge-cta { color: var(--primary, #d97706); }
.badge-expand {
  background: transparent; border: none; color: var(--text-secondary);
  cursor: pointer; padding: 0 4px; font-size: 14px;
}
.badge-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--primary, #d97706);
  padding: 0;
  font: inherit;
}

/* ── Buttons ─────────────────────────────────────────────────────────── */
.btn {
  border-radius: var(--radius-small, 6px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border: 1px solid transparent;
  cursor: pointer;
  font-size: var(--font-size-s, 14px);
}
.btn[disabled] { opacity: 0.55; cursor: not-allowed; }
.btn.primary {
  background: var(--primary, #f59e0b);
  color: var(--text-on-primary, #fff);
}
.btn.secondary {
  background: transparent;
  color: var(--text);
  border-color: var(--border);
}

/* ── Mobile ──────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .banner.full { padding: var(--space-2, 8px) var(--space-3, 12px); }
  .banner-ctas { width: 100%; }
  .badge {
    bottom: calc(56px + env(safe-area-inset-bottom, 0) + var(--space-3, 12px));
  }
}
</style>
