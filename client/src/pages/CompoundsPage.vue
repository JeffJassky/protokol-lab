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
        <div class="mkt-eyebrow">Reference · Compound library</div>
        <h1 class="mkt-h1">Every GLP-1,<br /><span class="accent">modeled correctly.</span></h1>
        <p class="mkt-lead">
          Protokol Lab's built-in compound library covers every FDA-approved
          GLP-1 receptor agonist plus the research peptides advanced users
          track. Each compound carries published pharmacokinetic defaults so
          dose curves are accurate from the first injection — not a generic
          decay line.
        </p>

        <h2 class="mkt-h2">Built-in compounds</h2>
        <table class="mkt-table">
          <thead>
            <tr><th>Compound</th><th>Brand names</th><th>Half-life (t½)</th><th>Route</th><th>Typical interval</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Tirzepatide</strong></td><td>Mounjaro, Zepbound</td><td>~5 days</td><td>Sub-Q</td><td>Weekly</td></tr>
            <tr><td><strong>Semaglutide</strong></td><td>Ozempic, Wegovy</td><td>~7 days</td><td>Sub-Q</td><td>Weekly</td></tr>
            <tr><td><strong>Semaglutide (oral)</strong></td><td>Rybelsus</td><td>~7 days</td><td>Oral</td><td>Daily</td></tr>
            <tr><td><strong>Liraglutide</strong></td><td>Saxenda, Victoza</td><td>~13 hours</td><td>Sub-Q</td><td>Daily</td></tr>
            <tr><td><strong>Dulaglutide</strong></td><td>Trulicity</td><td>~5 days</td><td>Sub-Q</td><td>Weekly</td></tr>
            <tr><td><strong>Retatrutide</strong></td><td>(research — phase 2/3)</td><td>~6 days</td><td>Sub-Q</td><td>Weekly</td></tr>
            <tr><td><strong>Cagrilintide</strong></td><td>(research)</td><td>~7 days</td><td>Sub-Q</td><td>Weekly</td></tr>
            <tr><td><strong>Survodutide</strong></td><td>(research)</td><td>~6–7 days</td><td>Sub-Q</td><td>Weekly</td></tr>
            <tr><td><strong>Custom</strong></td><td>—</td><td>User-defined</td><td>Any</td><td>Any</td></tr>
          </tbody>
        </table>

        <h2 class="mkt-h2">How Protokol Lab models these</h2>
        <p class="mkt-p">
          Every dose is modeled with the <strong>Bateman equation</strong> — the
          standard two-compartment pharmacokinetic model for extravascular
          absorption. For subcutaneous peptides, the kinetic shape is a rise
          over a few hours (absorption rate k<sub>a</sub>) followed by
          first-order elimination at the compound's half-life.
        </p>
        <p class="mkt-p">
          When you stack multiple doses or run multiple compounds
          simultaneously (e.g. tirzepatide + cagrilintide), curves are summed
          correctly so the active level at any point in time reflects the full
          schedule — not just the most recent injection.
        </p>

        <h2 class="mkt-h2">Supported kinetic profiles</h2>
        <ul class="mkt-ul">
          <li><strong>Bolus</strong> — instant peak, exponential decay. IV-like, or anything with near-immediate peak.</li>
          <li><strong>Sub-Q</strong> — rises over a few hours, then decays. Default for self-injected peptides and GLP-1s.</li>
          <li><strong>Depot</strong> — slow release, lower peak, long tail. Long-acting weekly formulations and oil-based depots.</li>
        </ul>

        <h2 class="mkt-h2">Compounded GLP-1s</h2>
        <p class="mkt-p">
          Use the built-in Tirzepatide or Semaglutide preset for compounded
          versions — the peptide and its pharmacokinetics are identical to the
          brand-name formulation. If your compounding pharmacy uses a
          non-standard concentration or mix (e.g. tirzepatide +
          cagrilintide), add a custom compound with the name and half-life
          you prefer.
        </p>

        <h2 class="mkt-h2">Citations</h2>
        <ul class="mkt-ul">
          <li>Urva S, et al. "Effects of renal impairment on the pharmacokinetics of the dual GIP and GLP-1 receptor agonist tirzepatide." <em>Clinical Pharmacokinetics</em> (2021). Tirzepatide t½ ≈ 5 days.</li>
          <li>Lau J, et al. "Discovery of the Once-Weekly Glucagon-Like Peptide-1 (GLP-1) Analogue Semaglutide." <em>Journal of Medicinal Chemistry</em> (2015). Semaglutide t½ ≈ 7 days.</li>
          <li>Jastreboff AM, et al. "Triple–Hormone-Receptor Agonist Retatrutide for Obesity — A Phase 2 Trial." <em>New England Journal of Medicine</em> (2023).</li>
          <li>Enebo LB, et al. "Safety, tolerability, pharmacokinetics, and pharmacodynamics of concomitant administration of multiple doses of cagrilintide with semaglutide." <em>The Lancet</em> (2021).</li>
        </ul>

        <div class="mkt-cta-row">
          <a href="/register" class="mkt-btn-primary">Start tracking free →</a>
          <a href="/features" class="mkt-btn-secondary">See features</a>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>
