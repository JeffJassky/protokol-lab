<script setup>
import MarketingLayout from '../components/MarketingLayout.vue';
import MarketingEndCta from '../components/MarketingEndCta.vue';
import { useRouteSeo, ORIGIN } from '../composables/useSeo.js';
import { listComparisons } from '../comparisons.js';
import '../styles/marketing.css';

const comparisons = listComparisons();

// Group by category for the index view.
const groups = [
  { key: 'native',      title: 'GLP-1-native apps',        blurb: 'Purpose-built for GLP-1 users — dose tracking, injection scheduling, side-effect logging.' },
  { key: 'pwa',         title: 'GLP-1 PWAs',               blurb: 'Progressive Web Apps. No App Store distribution; often free.' },
  { key: 'traditional', title: 'Traditional trackers',     blurb: 'General-purpose calorie counters. Massive food databases, zero GLP-1 awareness.' },
].map((g) => ({ ...g, items: comparisons.filter((c) => c.category === g.key) }));

// Aggregate schema — a single ItemList referencing every comparison page.
// Helps crawlers discover the full set from one entry point.
useRouteSeo({
  schema: [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Protokol Lab — GLP-1 tracker comparisons',
      itemListElement: comparisons.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${ORIGIN}/compare/${c.slug}`,
        name: `Protokol Lab vs ${c.name}`,
      })),
    },
  ],
});
</script>

<template>
  <MarketingLayout>
    <section class="mkt-page">
      <div class="wrap">
        <div class="mkt-eyebrow">Alternatives · Comparisons</div>
        <h1 class="mkt-h1">
          Protokol Lab vs<br /><span class="accent">every other GLP-1 tracker.</span>
        </h1>
        <p class="mkt-lead">
          Honest head-to-heads against every tracker in the GLP-1 space — iOS natives
          like Shotsy and MeAgain, free PWAs like Glapp and DoseDiary, and legacy
          calorie counters like MyFitnessPal and MacroFactor. Feature matrices,
          pricing, and a clear "use them if…" vs "use us if…" on every page.
        </p>

        <div v-for="g in groups" :key="g.key" class="cmp-group">
          <h2 class="mkt-h2">{{ g.title }}</h2>
          <p class="mkt-p">{{ g.blurb }}</p>
          <div class="cmp-grid">
            <a
              v-for="c in g.items"
              :key="c.slug"
              :href="`/compare/${c.slug}`"
              class="cmp-card"
            >
              <div class="cmp-card-head">
                <span class="cmp-name">Protokol Lab vs <strong>{{ c.name }}</strong></span>
                <span class="cmp-arrow">→</span>
              </div>
              <p class="cmp-tag">{{ c.tagline }}</p>
            </a>
          </div>
        </div>

        <h2 class="mkt-h2">What makes Protokol Lab different</h2>
        <p class="mkt-p">
          Two things no other tracker in the space combines:
        </p>
        <ul class="mkt-ul">
          <li><strong>Pharmacokinetic dose modeling</strong> — Bateman-equation half-life curves for every built-in compound and any custom compound you add.</li>
          <li><strong>Rolling 7-day calorie budget</strong> — calories roll forward so low-appetite days after your shot don't read as failure.</li>
          <li><strong>0–10 symptom severity</strong> — correlate nausea, fatigue, or injection-site reactions against your dose curve, not just a yes/no toggle.</li>
          <li><strong>Agentic AI</strong> — reads your full log, searches the web, creates custom foods, and writes entries into your day.</li>
        </ul>

      </div>
    </section>
    <MarketingEndCta
      heading="See it for yourself."
      lead="Real data. No signup required."
      variant="pricing"
    />
  </MarketingLayout>
</template>

<style scoped>
.cmp-group { margin-top: 40px; }
.cmp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin: 20px 0 32px;
}
.cmp-card {
  display: block;
  padding: 20px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s, transform 0.15s;
}
.cmp-card:hover { border-color: var(--primary); transform: translate(-1px, -1px); }
.cmp-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
}
.cmp-name { color: var(--text); }
.cmp-name strong { color: var(--primary); font-weight: 700; }
.cmp-arrow { color: var(--primary); font-weight: 700; }
.cmp-tag { font-size: 12px; color: var(--text-tertiary); margin: 0; line-height: 1.5; }
</style>
