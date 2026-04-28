<script setup>
// Renders the right banner state for the visitor's session:
//
//   anon, expanded:           full top banner — primary "Set Up My Profile" + "Keep Exploring"
//   anon, collapsed:          corner badge — "Demo · Set Up Profile"
//   authed (no toggle), badge: corner badge — "View Demo" (creates sandbox on click)
//   authed (toggle on), badge: corner badge — "Exit Demo" (+ Reset menu)
//   none:                     hidden
//
// PRD §6.4 spells out the four states. Banner persistence is per-session
// (collapsed flag is in-memory) — refresh re-expands so the conversion CTA
// stays available.

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDemoStore } from '../stores/demo.js';
import { useAuthStore } from '../stores/auth.js';

const demo = useDemoStore();
const auth = useAuthStore();
const router = useRouter();

const busy = ref(false);
const showResetConfirm = ref(false);

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
  if (demo.mode === 'none') {
    // Authed user with no sandbox toggled on — show the inverse "View Demo"
    // badge so they can flip over to see the populated dashboard. PRD §6.2
    // calls this out as a retention pattern dressed as a demo feature.
    if (auth.user) return 'authed-real';
    return 'hidden';
  }
  if (demo.mode === 'anon') {
    return demo.banner.collapsed ? 'anon-collapsed' : 'anon-expanded';
  }
  // Authed with toggle on
  if (demo.sandboxId) return 'authed-demo';
  return 'authed-real';
});

async function setUpProfile() {
  // Anon → /start lets them claim the email + create an account.
  router.push('/start');
}

async function viewDemo() {
  busy.value = true;
  try {
    await demo.enter();
  } finally {
    busy.value = false;
  }
}

async function exitDemo() {
  busy.value = true;
  try {
    await demo.exit();
  } finally {
    busy.value = false;
  }
}

async function confirmReset() {
  busy.value = true;
  try {
    await demo.reset();
    // After reset the page-local data is stale — reload so charts/lists
    // pick up the freshly cloned rows without a per-store rehydrate dance.
    window.location.reload();
  } finally {
    busy.value = false;
    showResetConfirm.value = false;
  }
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
        <button class="btn primary" :disabled="busy" @click="setUpProfile">
          Set Up My Profile
        </button>
        <button class="btn secondary" :disabled="busy" @click="collapse">
          Keep Exploring
        </button>
      </div>
    </div>
  </div>

  <div v-else-if="state === 'anon-collapsed'" class="badge anon">
    <button
      class="badge-btn primary-cta"
      :disabled="busy"
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

  <div v-else-if="state === 'authed-real' && false" class="badge view-demo">
    <button class="badge-btn" :disabled="busy" type="button" @click="viewDemo">
      <span class="badge-label">View Jeff's demo</span>
      <span class="badge-cta">→</span>
    </button>
  </div>

  <div v-else-if="state === 'authed-demo'" class="badge in-demo">
    <span class="badge-label">In demo · Jeff's profile</span>
    <div class="badge-actions">
      <button
        class="badge-btn-link"
        :disabled="busy"
        type="button"
        @click="exitDemo"
      >
        Exit
      </button>
      <button
        class="badge-btn-link"
        :disabled="busy"
        type="button"
        @click="showResetConfirm = true"
      >
        Reset
      </button>
    </div>
  </div>

  <div
    v-if="showResetConfirm"
    class="modal-backdrop"
    @click.self="showResetConfirm = false"
  >
    <div class="modal" role="dialog" aria-modal="true">
      <h3>Reset demo data?</h3>
      <p>
        This wipes your demo sandbox and reclones it from the current template.
        Anything you've added or edited in demo mode will be lost. Your real
        account data is not affected.
      </p>
      <div class="modal-actions">
        <button
          class="btn secondary"
          :disabled="busy"
          @click="showResetConfirm = false"
        >
          Cancel
        </button>
        <button class="btn primary" :disabled="busy" @click="confirmReset">
          Reset
        </button>
      </div>
    </div>
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
.badge.in-demo { background: var(--primary-soft, #fef3c7); border-color: var(--primary, #f59e0b); }
.badge-label { font-weight: var(--font-weight-medium, 500); }
.badge-cta { color: var(--primary, #d97706); }
.badge-expand {
  background: transparent; border: none; color: var(--text-secondary);
  cursor: pointer; padding: 0 4px; font-size: 14px;
}
.badge-actions { display: flex; gap: var(--space-2, 8px); }
.badge-btn,
.badge-btn-link {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--primary, #d97706);
  padding: 0;
  font: inherit;
}
.badge-btn-link { color: var(--text-secondary); text-decoration: underline; }
.badge-btn-link:hover { color: var(--text); }

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

/* ── Reset confirm modal ─────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-4, 16px);
}
.modal {
  background: var(--surface, #fff);
  border-radius: var(--radius-medium, 10px);
  padding: var(--space-6, 24px);
  max-width: 420px;
  width: 100%;
}
.modal h3 { margin: 0 0 var(--space-3, 12px); }
.modal p { color: var(--text-secondary); font-size: var(--font-size-s); margin: 0 0 var(--space-4); }
.modal-actions { display: flex; justify-content: flex-end; gap: var(--space-2, 8px); }

/* ── Mobile ──────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .banner.full { padding: var(--space-2, 8px) var(--space-3, 12px); }
  .banner-ctas { width: 100%; }
  .badge {
    bottom: calc(56px + env(safe-area-inset-bottom, 0) + var(--space-3, 12px));
  }
}
</style>
