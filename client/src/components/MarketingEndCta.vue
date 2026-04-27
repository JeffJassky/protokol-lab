<script setup>
// Standard end-of-marketing-page CTA pair. Drop in at the bottom of any
// marketing page so the conversion ask is consistent across the funnel
// (PRD §6 + docs/customer-journey.md §3).
//
// Variants:
//   variant="default"  - primary "Try the demo" + secondary "Sign up free"
//   variant="pricing"  - primary "Try the demo" + secondary "See pricing"
//
// Pass a heading + lead via slots or props for copy that fits the page.

import { useRouter } from 'vue-router';
import { useTryDemo } from '../composables/useTryDemo.js';

const props = defineProps({
  heading: { type: String, default: 'Stop guessing. Start tracking.' },
  lead: { type: String, default: '' },
  variant: { type: String, default: 'default' }, // 'default' | 'pricing'
});

const router = useRouter();
const { tryDemo, demoStarting } = useTryDemo();

function goSignup() { router.push('/register'); }
function goPricing() { router.push('/pricing'); }
</script>

<template>
  <section class="end-cta">
    <h2 class="end-cta-heading">{{ heading }}</h2>
    <p v-if="lead" class="end-cta-lead">{{ lead }}</p>
    <slot />
    <div class="end-cta-buttons">
      <button class="end-btn primary" :disabled="demoStarting" @click="tryDemo">
        {{ demoStarting ? 'Loading…' : 'Try the demo →' }}
      </button>
      <button
        v-if="variant === 'pricing'"
        class="end-btn secondary"
        @click="goPricing"
      >
        See pricing
      </button>
      <button v-else class="end-btn secondary" @click="goSignup">
        Sign up free
      </button>
    </div>
  </section>
</template>

<style scoped>
.end-cta {
  padding: 64px 24px;
  text-align: center;
  border-top: 1px solid var(--border);
  margin-top: 64px;
}
.end-cta-heading {
  font-size: 28px;
  margin: 0 0 12px;
  letter-spacing: -0.02em;
}
.end-cta-lead {
  color: var(--text-secondary);
  max-width: 540px;
  margin: 0 auto 24px;
  font-size: 14px;
}
.end-cta-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}
.end-btn {
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 14px 24px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background .15s, color .15s, border-color .15s, transform .15s;
}
.end-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
.end-btn.primary {
  background: var(--primary);
  color: var(--bg);
  border: 1px solid var(--primary);
}
.end-btn.primary:hover:not([disabled]) {
  background: var(--primary-hover, var(--primary));
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--primary-dim);
}
.end-btn.secondary {
  background: transparent;
  color: var(--text);
  border: 1px solid var(--border-strong, var(--border));
}
.end-btn.secondary:hover:not([disabled]) {
  border-color: var(--primary);
  color: var(--primary);
}
</style>
