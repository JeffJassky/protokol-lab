<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MARKETING_NAV } from '../marketing-nav.js';
import { useAuthStore } from '../stores/auth.js';
import { useDemoStore } from '../stores/demo.js';
import { track } from '../composables/useTracker.js';
import { useTryDemo } from '../composables/useTryDemo.js';
import BrandWordmark from './BrandWordmark.vue';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const demo = useDemoStore();

const goLogin = () => {
  track('cta_click', { cta: 'login', surface: 'nav' });
  router.push('/login');
};
const goRegister = () => {
  track('cta_click', { cta: 'signup', surface: 'nav' });
  router.push('/register');
};
const goHome = () => router.push('/');
const goApp = () => router.push('/dashboard');

// Use the shared composable so the nav CTA gets the same authed-user guard
// as marketing-page CTAs (authed visitors land on /dashboard rather than
// hitting /api/demo/start, which rejects authed sessions with 400).
const { tryDemo: startDemo, demoStarting } = useTryDemo();
const tryDemo = () => startDemo({ surface: 'nav' });

// Visible CTAs depend on session state — see docs/customer-journey.md §3.
const inApp = computed(() => Boolean(auth.user) || demo.inDemo);
const showAcquisitionCtas = computed(() => !inApp.value);

const menuOpen = ref(false);
const toggleMenu = () => { menuOpen.value = !menuOpen.value; };
const closeMenu = () => { menuOpen.value = false; };
watch(() => route.fullPath, closeMenu);
</script>

<template>
  <div class="mkt-root">
    <div class="scanlines" aria-hidden="true"></div>

    <!-- NAV -->
    <div class="nav">
      <div class="wrap nav-inner">
        <span class="logo" @click="goHome" role="button" tabindex="0">
          <BrandWordmark :size="16" />
        </span>
        <nav class="nav-links" aria-label="Primary">
          <a v-for="l in MARKETING_NAV" :key="l.href" :href="l.href" class="nav-link">{{ l.label }}</a>
        </nav>
        <div class="nav-cta-group nav-cta-desktop">
          <template v-if="showAcquisitionCtas">
            <button class="nav-cta primary" :disabled="demoStarting" @click="tryDemo">
              {{ demoStarting ? 'Loading…' : 'Try the demo' }}
            </button>
            <button class="nav-cta secondary" @click="goRegister">Sign up</button>
            <button class="nav-cta tertiary" @click="goLogin">Sign in</button>
          </template>
          <template v-else>
            <button class="nav-cta primary" @click="goApp">Open app</button>
          </template>
        </div>
        <button
          class="nav-burger"
          :aria-expanded="menuOpen"
          aria-controls="mkt-mobile-menu"
          aria-label="Toggle menu"
          @click="toggleMenu"
        >
          <span class="burger-bar" :class="{ open: menuOpen }"></span>
          <span class="burger-bar" :class="{ open: menuOpen }"></span>
          <span class="burger-bar" :class="{ open: menuOpen }"></span>
        </button>
      </div>
      <div
        id="mkt-mobile-menu"
        class="mobile-menu"
        :class="{ open: menuOpen }"
        :aria-hidden="!menuOpen"
      >
        <div class="wrap mobile-menu-inner">
          <a
            v-for="l in MARKETING_NAV"
            :key="l.href"
            :href="l.href"
            class="mobile-link"
            @click="closeMenu"
          >{{ l.label }}</a>
          <div class="mobile-cta-stack">
            <template v-if="showAcquisitionCtas">
              <button class="nav-cta primary mobile-cta" :disabled="demoStarting" @click="tryDemo">
                {{ demoStarting ? 'Loading…' : 'Try the demo' }}
              </button>
              <button class="nav-cta secondary mobile-cta" @click="goRegister">Sign up</button>
              <button class="nav-cta tertiary mobile-cta" @click="goLogin">Sign in</button>
            </template>
            <template v-else>
              <button class="nav-cta primary mobile-cta" @click="goApp">Open app</button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <slot />

    <!-- FOOTER -->
    <footer class="mkt-footer">
      <div class="wrap">
        <div class="footer-grid">
          <div>
            <div class="logo footer-logo">
              <BrandWordmark :size="16" />
            </div>
            <div class="footer-blurb">
              The GLP-1 tracker for Tirzepatide, Semaglutide, and compounded
              peptides. Dose half-life curves, weekly rolling budgets, agentic
              AI.
            </div>
          </div>
          <div class="footer-col">
            <h4>Product</h4>
            <ul>
              <li><a href="/features">Features</a></li>
              <li><a href="/ai">AI</a></li>
              <li><a href="/compounds">Compounds</a></li>
              <li><a href="/pricing">Pricing</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Resources</h4>
            <ul>
              <li><a href="/faq">FAQ</a></li>
              <li><a href="/blog">Blog</a></li>
              <li><a href="/compare">Compare trackers</a></li>
              <li><a href="/medical-advisory">Medical advisory</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href="/about">About</a></li>
              <li><a href="/terms">Terms</a></li>
              <li><a href="/privacy">Privacy</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-disclaimer">
          Protokol Lab is an organizational and mathematical modeling tool.
          It is not a medical device and does not provide medical advice,
          diagnosis, treatment, dosing recommendations, or titration
          suggestions. Protokol Lab publishes pharmacokinetic defaults only
          for FDA-approved medications; users who track other substances
          supply their own values and assume full responsibility for the
          accuracy of those values and for the legality of any substance
          they track. Protokol Lab does not sell, ship, distribute, refer
          users to, or endorse any pharmacy, telehealth provider,
          compounding facility, or substance. Consult a licensed medical
          professional before making any decision about your medication or
          health.
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.mkt-root {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
  position: relative;
  overflow-x: clip;
}
.scanlines {
  position: fixed; inset: 0; pointer-events: none; z-index: 100;
  background:
    repeating-linear-gradient(
      to bottom,
      rgba(91, 245, 145, 0.018) 0,
      rgba(91, 245, 145, 0.018) 1px,
      transparent 1px,
      transparent 3px
    ),
    radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.35) 100%);
}
.wrap { max-width: 1240px; margin: 0 auto; padding: 0 32px; }

.nav {
  position: sticky; top: 0; z-index: 20;
  background: color-mix(in srgb, var(--bg) 85%, transparent);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.nav-inner { display: flex; align-items: center; gap: 28px; padding-block: 14px; }
.logo {
  display: inline-flex; align-items: center; gap: 10px;
  font-weight: 700; letter-spacing: 0.02em; font-size: 15px;
  color: var(--text); cursor: pointer;
}
.logo-mark { display: inline-flex; color: var(--text); }
.nav-links { display: flex; gap: 22px; margin-left: auto; flex-wrap: wrap; }
.nav-link {
  font-size: 12px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em;
  transition: color .15s;
  text-decoration: none;
}
.nav-link:hover { color: var(--text); }
.nav-cta-group { display: flex; gap: 8px; align-items: center; }
.nav-cta {
  font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  padding: 8px 16px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  transition: background .15s, color .15s, border-color .15s;
}
.nav-cta[disabled] { opacity: 0.55; cursor: not-allowed; }
.nav-cta.primary {
  background: var(--primary);
  color: var(--bg);
  border: 1px solid var(--primary);
}
.nav-cta.primary:hover:not([disabled]) { background: var(--primary-hover, var(--primary)); }
.nav-cta.secondary {
  background: transparent;
  color: var(--primary);
  border: 1px solid var(--primary);
}
.nav-cta.secondary:hover:not([disabled]) { background: var(--primary); color: var(--bg); }
.nav-cta.tertiary {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
  padding: 8px 12px;
}
.nav-cta.tertiary:hover:not([disabled]) { color: var(--text); }

.nav-burger {
  display: none;
  margin-left: auto;
  background: transparent;
  border: none;
  width: 40px; height: 40px;
  padding: 0;
  cursor: pointer;
  position: relative;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.burger-bar {
  display: block;
  width: 18px; height: 1.5px;
  background: var(--text);
  transition: transform .2s, opacity .2s;
  transform-origin: center;
}
.burger-bar.open:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
.burger-bar.open:nth-child(2) { opacity: 0; }
.burger-bar.open:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }

.mobile-menu {
  display: none;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 97%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  overflow: hidden;
  max-height: 0;
  transition: max-height .25s ease;
}
.mobile-menu.open { max-height: 70vh; }
.mobile-menu-inner {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 8px 32px 16px;
}
.mobile-link {
  display: block;
  padding: 14px 0;
  font-size: 13px;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  text-decoration: none;
  border-bottom: 1px solid var(--border);
}
.mobile-link:hover { color: var(--primary); }
.mobile-cta-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
.mobile-cta { width: 100%; text-align: center; }

.mkt-footer {
  padding: 64px 0 48px;
  border-top: 1px solid var(--border);
  background: var(--surface-alt, var(--bg));
}
.footer-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 48px;
  margin-bottom: 40px;
}
.footer-logo { margin-bottom: 16px; }
.footer-blurb {
  color: var(--text-tertiary);
  max-width: 360px;
  font-size: 13px;
}
.footer-col h4 {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-tertiary);
  margin: 0 0 14px;
  font-weight: 600;
}
.footer-col ul { list-style: none; padding: 0; margin: 0; }
.footer-col li { margin-bottom: 8px; }
.footer-col a {
  color: var(--text);
  font-size: 13px;
  text-decoration: none;
}
.footer-col a:hover { color: var(--primary); }
.footer-disclaimer {
  font-size: 11px;
  color: var(--text-tertiary);
  max-width: 900px;
  line-height: 1.7;
  border-top: 1px solid var(--border);
  padding-top: 24px;
}
@media (max-width: 768px) {
  .footer-grid { grid-template-columns: 1fr 1fr; }
  .nav-links { display: none; }
  .nav-cta-desktop { display: none; }
  .nav-burger { display: inline-flex; }
  .mobile-menu { display: block; }
  .wrap { padding: 0 20px; }
  .mobile-menu-inner { padding: 8px 20px 16px; }
}
</style>
