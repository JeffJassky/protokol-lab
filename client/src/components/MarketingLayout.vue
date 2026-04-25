<script setup>
import { ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { MARKETING_NAV } from '../marketing-nav.js';
import BrandWordmark from './BrandWordmark.vue';

const router = useRouter();
const route = useRoute();
const goLogin = () => router.push('/login');
const goHome = () => router.push('/');

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
        <button class="nav-cta nav-cta-desktop" @click="goLogin">Sign in</button>
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
          <button class="nav-cta mobile-cta" @click="goLogin">Sign in</button>
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
.nav-cta {
  font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  padding: 8px 16px; border: 1px solid var(--primary);
  color: var(--primary); font-weight: 600;
  background: transparent; cursor: pointer;
  transition: background .15s, color .15s;
  font-family: inherit;
}
.nav-cta:hover { background: var(--primary); color: var(--bg); }

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
.mobile-cta {
  margin-top: 16px;
  align-self: flex-start;
}

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
