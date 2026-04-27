// Single entry point for "Try the demo" CTAs across marketing pages and
// in-app surfaces. Branches on auth state because /api/demo/start rejects
// authed sessions (anon-only) and authed users must use /api/demo/enter
// instead. Without this branch, an authed visitor browsing marketing pages
// (/features, /compounds, /ai, etc.) hits 400 on click.

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useDemoStore } from '../stores/demo.js';

export function useTryDemo() {
  const router = useRouter();
  const auth = useAuthStore();
  const demo = useDemoStore();
  const demoStarting = ref(false);

  async function tryDemo() {
    demoStarting.value = true;
    try {
      if (!demo.checked) await demo.fetchStatus();
      if (!demo.inDemo) {
        if (auth.user) await demo.enter();
        else await demo.startAnon();
      }
      router.push('/dashboard');
    } finally {
      demoStarting.value = false;
    }
  }

  return { tryDemo, demoStarting };
}
