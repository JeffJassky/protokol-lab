<script setup>
import { useRouter } from 'vue-router';
import MarketingLayout from '../components/MarketingLayout.vue';
import { useRouteSeo } from '../composables/useSeo.js';
import { useTryDemo } from '../composables/useTryDemo.js';

import MealsFeature from './features/sections/MealsFeature.vue';
import DoseFeature from './features/sections/DoseFeature.vue';
import BodyFeature from './features/sections/BodyFeature.vue';
import WellnessFeature from './features/sections/WellnessFeature.vue';
import SubjectContextFeature from './features/sections/SubjectContextFeature.vue';
import StayOnTrackFeature from './features/sections/StayOnTrackFeature.vue';
import DerivationsFeature from './features/sections/DerivationsFeature.vue';
import InsideFeature from './features/sections/InsideFeature.vue';
import InsightsFeature from './features/sections/InsightsFeature.vue';
import AskAiFeature from './features/sections/AskAiFeature.vue';
import YoursFeature from './features/sections/YoursFeature.vue';

useRouteSeo();

const router = useRouter();
const goRegister = () => router.push('/register');

const { tryDemo, demoStarting } = useTryDemo();
</script>

<template>
  <MarketingLayout>
    <div class="features-root">
      <!-- HERO -->
      <section class="feat-hero">
        <div class="wrap">
          <div class="eyebrow eyebrow-green">
            <span class="dot-live"></span> A tour
          </div>
          <h1>
            What Protokol<br /><span class="accent">actually does.</span>
          </h1>
          <p class="hero-lead">
            Built for people on Tirzepatide, Semaglutide, Mounjaro, Wegovy,
            Ozempic, Zepbound, and compounded peptides — and anyone else who
            wants to actually understand what's working.
          </p>
        </div>
      </section>

      <MealsFeature />
      <DoseFeature />
      <BodyFeature />
      <WellnessFeature />
      <SubjectContextFeature />
      <StayOnTrackFeature />
      <DerivationsFeature />
      <InsideFeature />
      <InsightsFeature />
      <AskAiFeature />
      <YoursFeature />

      <!-- FINAL CTA -->
      <section class="final-cta">
        <div class="wrap">
          <h2>That's the tour.<br /><span class="accent">Start tracking.</span></h2>
          <p>Free for everything you log. Premium unlocks the AI.</p>
          <div class="cta-buttons">
            <button class="btn-primary big" :disabled="demoStarting" @click="tryDemo">
              {{ demoStarting ? 'Loading…' : 'Try the demo →' }}
            </button>
            <button class="btn-secondary big" @click="goRegister">Sign up free</button>
          </div>
        </div>
      </section>
    </div>
  </MarketingLayout>
</template>

<!--
  Shared, unscoped under .features-root so children can use the same
  primitives without duplicating styles. Mirrors LandingPage's `.feat-row`
  / `.hero-terminal` aesthetic so the brand reads consistent.
-->
<style>
.features-root .wrap { max-width: 1240px; margin: 0 auto; padding: 0 32px; }
.features-root .accent { color: var(--primary); }
.features-root .dim { color: var(--text-tertiary); }

.features-root .eyebrow {
  font-size: 11px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.18em;
  display: inline-flex; align-items: center; gap: 10px;
  margin-bottom: 20px;
}
.features-root .eyebrow.eyebrow-green { color: var(--primary); }
.features-root .eyebrow .dot-live {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--primary); box-shadow: 0 0 8px var(--primary);
  animation: pulse 2s infinite;
}
@keyframes pulse { 50% { opacity: 0.4; } }

/* Feature row (alternating layout, mirrors LandingPage) */
.features-root .feat-section {
  padding: 96px 0; border-bottom: 1px solid var(--border);
}
.features-root .feat-row {
  display: grid; grid-template-columns: 1fr 1.15fr;
  gap: 64px; align-items: center;
}
.features-root .feat-row.reverse { grid-template-columns: 1.15fr 1fr; }
.features-root .feat-row.reverse .feat-text { order: 2; }
.features-root .feat-row.reverse .feat-visual { order: 1; }
.features-root .feat-head {
  font-family: var(--font-display);
  font-size: 36px; line-height: 1.1; margin: 0 0 18px;
  font-weight: 700; letter-spacing: -0.015em;
}
.features-root .feat-body {
  font-size: 15px; color: var(--text-secondary); line-height: 1.65;
  margin-bottom: 24px; max-width: 460px;
}
.features-root .feat-bullets {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 10px;
  max-width: 480px;
}
.features-root .feat-bullets li {
  display: flex; gap: 10px; font-size: 13px; color: var(--text-secondary);
  line-height: 1.5;
}
.features-root .feat-bullets li::before {
  content: '›'; color: var(--primary); font-weight: 700; flex-shrink: 0;
}
.features-root .feat-bullets li b { color: var(--text); font-weight: 600; }

/* Clean visual frame — bordered surface, subtle shadow, no fake-OS chrome. */
.features-root .feat-frame {
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
  box-shadow: var(--shadow-l);
  position: relative;
}

.features-root .block-svg { width: 100%; height: auto; display: block; }
.features-root .svg-axis-dim {
  font-size: 9px; fill: var(--text-tertiary); font-family: var(--font-mono);
}
.features-root .mini-eyebrow {
  font-size: 9px; color: var(--text-tertiary);
  text-transform: uppercase; letter-spacing: 0.12em;
}

@media (max-width: 980px) {
  .features-root .feat-row,
  .features-root .feat-row.reverse {
    grid-template-columns: 1fr; gap: 32px;
  }
  .features-root .feat-row.reverse .feat-text,
  .features-root .feat-row.reverse .feat-visual { order: unset; }
  .features-root .feat-section { padding: 56px 0; }
}
</style>

<style scoped>
.features-root {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

.feat-hero { padding: 96px 0 64px; border-bottom: 1px solid var(--border); }
.feat-hero h1 {
  font-family: var(--font-display);
  font-size: 64px; line-height: 1.02;
  margin: 0 0 20px; font-weight: 700;
  letter-spacing: -0.02em;
}
.hero-lead {
  font-size: 16px; color: var(--text-secondary);
  max-width: 600px; line-height: 1.65;
}

.final-cta {
  padding: 120px 0 140px;
  text-align: center;
  background: radial-gradient(ellipse at center, rgba(91,245,145,0.05) 0%, transparent 60%);
}
.final-cta h2 {
  font-family: var(--font-display);
  font-size: 48px; line-height: 1.05; margin: 0 0 20px;
  font-weight: 700; letter-spacing: -0.02em;
}
.final-cta p { font-size: 14px; color: var(--text-secondary); max-width: 520px; margin: 0 auto 32px; }
.cta-buttons { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.btn-primary {
  padding: 16px 28px; background: var(--primary); color: var(--bg);
  font-weight: 700; font-size: 14px;
  letter-spacing: 0.08em; text-transform: uppercase;
  border: none; cursor: pointer; font-family: inherit;
  transition: background .15s, transform .15s;
}
.btn-primary:hover {
  background: var(--primary-hover); transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 var(--primary-dim);
}
.btn-secondary {
  padding: 16px 28px; background: transparent; color: var(--text);
  border: 1px solid var(--border-strong); font-weight: 600; font-size: 14px;
  letter-spacing: 0.08em; text-transform: uppercase;
  cursor: pointer; font-family: inherit;
  transition: border-color .15s, color .15s;
}
.btn-secondary:hover { border-color: var(--primary); color: var(--primary); }

@media (max-width: 980px) {
  .feat-hero h1 { font-size: 44px; }
  .final-cta h2 { font-size: 36px; }
}
</style>
