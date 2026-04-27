// Demo session state. Mirrors the server's session-split model:
//   mode = 'none' | 'anon' | 'authed'
//   sandboxId — set whenever the active profile is a sandbox
//
// Used by the router guard (anon-demo can hit requiresAuth pages),
// the demo banner (renders state-specific CTAs), and any feature that
// needs to know the visitor isn't on real data.

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/index.js';

export const useDemoStore = defineStore('demo', () => {
  const mode = ref('none');
  const sandboxId = ref(null);
  const isAnonymous = ref(false);
  const templateAvailable = ref(false);
  const activePlanId = ref(null);
  const template = ref(null); // { compoundNames, dayCount, displayName }
  const checked = ref(false);
  const banner = ref({ collapsed: false }); // UI-only — not persisted

  const inDemo = computed(() => mode.value !== 'none' && sandboxId.value);

  async function fetchStatus() {
    try {
      const data = await api.get('/api/demo/status');
      mode.value = data.mode;
      sandboxId.value = data.sandboxId;
      isAnonymous.value = data.isAnonymous;
      templateAvailable.value = data.templateAvailable;
      activePlanId.value = data.activePlanId || null;
      template.value = data.template || null;
    } catch {
      mode.value = 'none';
      sandboxId.value = null;
      isAnonymous.value = false;
      activePlanId.value = null;
      template.value = null;
    } finally {
      checked.value = true;
    }
  }

  // Anonymous: mints a sandbox + sets demo cookie. Caller routes to /dashboard.
  async function startAnon() {
    const data = await api.post('/api/demo/start');
    mode.value = data.mode;
    sandboxId.value = data.sandboxId;
    isAnonymous.value = true;
    return data;
  }

  // Authed: toggle into demo (creates parented sandbox or reuses existing).
  async function enter() {
    const data = await api.post('/api/demo/enter');
    mode.value = 'authed';
    sandboxId.value = data.sandboxId;
    isAnonymous.value = false;
    return data;
  }

  async function exit() {
    await api.post('/api/demo/exit');
    sandboxId.value = null;
    isAnonymous.value = false;
    if (mode.value === 'authed') return;
    mode.value = 'none';
  }

  async function reset() {
    await api.post('/api/demo/reset');
  }

  // Beacon for client-side "wow feature" interactions. Fire-and-forget.
  function trackFeature(feature) {
    api.post('/api/demo/event', { feature }).catch(() => {});
  }

  function collapseBanner() { banner.value.collapsed = true; }
  function expandBanner() { banner.value.collapsed = false; }

  function clear() {
    mode.value = 'none';
    sandboxId.value = null;
    isAnonymous.value = false;
    checked.value = false;
  }

  return {
    mode, sandboxId, isAnonymous, templateAvailable, activePlanId, template, checked, banner, inDemo,
    fetchStatus, startAnon, enter, exit, reset, trackFeature,
    collapseBanner, expandBanner, clear,
  };
});
