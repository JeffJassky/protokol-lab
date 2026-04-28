// Single entry point for "Try the demo" CTAs across marketing pages.
// Demo is pre-register only — authed visitors don't see this CTA in
// MarketingLayout, but defensively if they hit it we just route them to
// the dashboard (their real account) instead of trying to start a demo.

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useDemoStore } from '../stores/demo.js';
import { track } from './useTracker.js';

export function useTryDemo() {
  const router = useRouter();
  const auth = useAuthStore();
  const demo = useDemoStore();
  const demoStarting = ref(false);

  // `surface` lets the caller tag *which* CTA fired (hero, end-of-page,
  // mid-funnel, etc.) so the funnel page can break cta_click counts down
  // by surface. Defaults to 'unknown' so an un-instrumented CTA still
  // emits something useful.
  async function tryDemo({ surface = 'unknown' } = {}) {
    track('cta_click', { cta: 'try_demo', surface });
    demoStarting.value = true;
    try {
      if (auth.user) {
        router.push('/dashboard');
        return;
      }
      if (!demo.checked) await demo.fetchStatus();
      if (!demo.inDemo) await demo.startAnon();
      router.push('/dashboard');
    } finally {
      demoStarting.value = false;
    }
  }

  return { tryDemo, demoStarting };
}
