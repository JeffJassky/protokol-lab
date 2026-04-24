<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();
const goLogin = () => router.push('/login');
const goHome = () => router.push('/');
</script>

<template>
  <div class="mkt-root">
    <div class="scanlines" aria-hidden="true"></div>

    <!-- NAV -->
    <div class="nav">
      <div class="wrap nav-inner">
        <span class="logo" @click="goHome" role="button" tabindex="0">
          <svg viewBox="0 0 64 64" width="22" height="22" class="logo-mark" aria-hidden="true">
            <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="2.5" />
            <line x1="32" y1="2"  x2="32" y2="18" stroke="currentColor" stroke-width="2.5" />
            <line x1="32" y1="46" x2="32" y2="62" stroke="currentColor" stroke-width="2.5" />
            <line x1="2"  y1="32" x2="18" y2="32" stroke="currentColor" stroke-width="2.5" />
            <line x1="46" y1="32" x2="62" y2="32" stroke="currentColor" stroke-width="2.5" />
            <circle cx="32" cy="32" r="7" fill="var(--primary)" />
          </svg>
          Protokol Lab
        </span>
        <nav class="nav-links" aria-label="Primary">
          <a href="/features" class="nav-link">Features</a>
          <a href="/ai" class="nav-link">AI</a>
          <a href="/compounds" class="nav-link">Compounds</a>
          <a href="/pricing" class="nav-link">Pricing</a>
          <a href="/faq" class="nav-link">FAQ</a>
          <a href="/blog" class="nav-link">Blog</a>
        </nav>
        <button class="nav-cta" @click="goLogin">Sign in</button>
      </div>
    </div>

    <slot />

    <!-- FOOTER -->
    <footer class="mkt-footer">
      <div class="wrap">
        <div class="footer-grid">
          <div>
            <div class="logo footer-logo">
              <svg viewBox="0 0 64 64" width="20" height="20" aria-hidden="true">
                <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" stroke-width="2.5" />
                <line x1="32" y1="2"  x2="32" y2="18" stroke="currentColor" stroke-width="2.5" />
                <line x1="32" y1="46" x2="32" y2="62" stroke="currentColor" stroke-width="2.5" />
                <line x1="2"  y1="32" x2="18" y2="32" stroke="currentColor" stroke-width="2.5" />
                <line x1="46" y1="32" x2="62" y2="32" stroke="currentColor" stroke-width="2.5" />
                <circle cx="32" cy="32" r="7" fill="var(--primary)" />
              </svg>
              Protokol Lab
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
              <li><a href="/medical-advisory">Medical advisory</a></li>
              <li><a href="/advanced">Research peptides</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Company</h4>
            <ul>
              <li><a href="/about">About</a></li>
              <li><a href="/medical-advisory">Terms &amp; privacy</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-disclaimer">
          Protokol Lab is an organizational and mathematical modeling tool. It
          does not provide medical advice, diagnose conditions, or recommend
          the consumption of any substance. Users are solely responsible for
          how they interpret their own data. Protokol Lab does not sell,
          distribute, or endorse any compound listed in its library. Consult a
          licensed medical professional before making decisions about your
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
.nav-inner { display: flex; align-items: center; gap: 28px; padding: 14px 0; }
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
}
</style>
