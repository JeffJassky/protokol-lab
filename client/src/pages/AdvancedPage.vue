<script setup>
import MarketingLayout from '../components/MarketingLayout.vue';
import { useRouteSeo } from '../composables/useSeo.js';
import '../styles/marketing.css';

useRouteSeo();
</script>

<template>
  <MarketingLayout>
    <section class="mkt-page">
      <div class="wrap">
        <div class="mkt-eyebrow">Advanced · Research peptides</div>
        <h1 class="mkt-h1">Custom compounds,<br /><span class="accent">stacked correctly.</span></h1>
        <p class="mkt-lead">
          Protokol Lab's custom compound system is built for users who track
          beyond the brand-name GLP-1s — retatrutide, cagrilintide,
          survodutide, tirzepatide + cagrilintide combinations, or any
          peptide with a published half-life. Two fields per compound, and
          the curve draws itself.
        </p>

        <div class="mkt-callout">
          <strong>Not medical advice.</strong> Protokol Lab does not sell,
          distribute, or endorse any compound in its library, built-in or
          custom. Research peptides are not approved for human use by the
          FDA. Obtain any substance through a licensed prescriber and
          pharmacy.
        </div>

        <h2 class="mkt-h2">What you can track</h2>
        <ul class="mkt-ul">
          <li><strong>Retatrutide</strong> — triple agonist (GLP-1 / GIP / glucagon). Weekly sub-Q, ~6-day half-life.</li>
          <li><strong>Cagrilintide</strong> — amylin analogue. Often stacked with semaglutide. Weekly sub-Q, ~7-day half-life.</li>
          <li><strong>Survodutide</strong> — dual agonist (GLP-1 / glucagon). Weekly sub-Q.</li>
          <li><strong>Tirzepatide + cagrilintide</strong> — experimental stack. Independent curves, summed correctly.</li>
          <li><strong>Custom research peptides</strong> — any name, any half-life, any dose schedule.</li>
        </ul>

        <h2 class="mkt-h2">Kinetic shapes</h2>
        <p class="mkt-p">Pick the absorption profile that matches the peptide and formulation:</p>
        <ul class="mkt-ul">
          <li><strong>Bolus</strong> — instant peak, exponential decay. IV-style.</li>
          <li><strong>Sub-Q</strong> — rises over a few hours, then decays. Default for self-injected peptides.</li>
          <li><strong>Depot</strong> — slow release, lower peak, long tail. Long-acting formulations.</li>
        </ul>

        <h2 class="mkt-h2">Stacking and cycle planning</h2>
        <p class="mkt-p">
          Multiple active compounds stack correctly — curves are summed at
          every time point so the active blood level chart reflects all
          running compounds, not just the last injection. Useful for
          dose-escalation cycles, stacked peptides, and comparing side-by-side
          protocols against weight/appetite response.
        </p>

        <h2 class="mkt-h2">Data export</h2>
        <p class="mkt-p">
          Full history export as JSON or CSV, always free. Bring your raw
          data to a physician, a spreadsheet, or a research notebook whenever
          you want.
        </p>

        <div class="mkt-cta-row">
          <a href="/register" class="mkt-btn-primary">Create free account →</a>
          <a href="/compounds" class="mkt-btn-secondary">See compound library</a>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>
