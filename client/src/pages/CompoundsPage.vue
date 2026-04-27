<script setup>
import MarketingLayout from '../components/MarketingLayout.vue';
import { useRouteSeo } from '../composables/useSeo.js';
import { useTryDemo } from '../composables/useTryDemo.js';
import '../styles/marketing.css';

useRouteSeo();

const { tryDemo, demoStarting } = useTryDemo();
</script>

<template>
  <MarketingLayout>
    <section class="mkt-page">
      <div class="wrap">
        <div class="mkt-eyebrow">Reference · Compound library</div>
        <h1 class="mkt-h1">Every FDA-approved GLP-1,<br /><span class="accent">modeled correctly.</span></h1>
        <p class="mkt-lead">
          Protokol Lab ships pharmacokinetic defaults for every FDA-approved
          GLP-1 receptor agonist. Each built-in compound carries published
          peer-reviewed PK values so dose curves are accurate from the first
          injection — not a generic decay line.
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
          </tbody>
        </table>

        <h2 class="mkt-h2">Compounded versions</h2>
        <p class="mkt-p">
          Compounded tirzepatide and compounded semaglutide from a licensed
          compounding pharmacy contain the same active peptides as the
          brand-name versions. Use the built-in Tirzepatide or Semaglutide
          preset — the half-life, kinetic shape, and dose-to-active-level
          math are identical. Record your prescribed mg per injection, not
          the pen or vial label.
        </p>

        <h2 class="mkt-h2">Custom compounds</h2>
        <p class="mkt-p">
          For any compound outside the FDA-approved list — for example,
          a substance prescribed under a clinical trial, an investigational
          formulation, or a compounded mix with non-standard concentrations —
          users can add a custom compound by entering a name and a half-life.
        </p>
        <p class="mkt-p">
          Protokol Lab <strong>does not publish pharmacokinetic defaults</strong>
          for compounds that are not FDA-approved. Users supply their own
          values and assume full responsibility for the accuracy of those
          values and for the legality of any substance they choose to track.
          Protokol Lab does not sell, ship, distribute, refer users to, or
          endorse any pharmacy, telehealth provider, or compounding facility
          for any substance.
        </p>

        <h2 class="mkt-h2">How Protokol Lab models these</h2>
        <p class="mkt-p">
          Every dose is modeled with the <strong>Bateman equation</strong> — the
          standard two-compartment pharmacokinetic model for extravascular
          absorption. For subcutaneous peptides, the kinetic shape is a rise
          over a few hours (absorption rate k<sub>a</sub>) followed by
          first-order elimination at the compound's half-life.
        </p>
        <p class="mkt-p">
          When you stack multiple doses of the same compound, or run multiple
          compounds simultaneously, curves are summed correctly so the active
          level at any point in time reflects the full schedule — not just the
          most recent injection.
        </p>

        <h2 class="mkt-h2">Supported kinetic profiles</h2>
        <ul class="mkt-ul">
          <li><strong>Bolus</strong> — instant peak, exponential decay. IV-like, or anything with near-immediate peak.</li>
          <li><strong>Sub-Q</strong> — rises over a few hours, then decays. Default for self-injected peptides and GLP-1s.</li>
          <li><strong>Depot</strong> — slow release, lower peak, long tail. Long-acting weekly formulations and oil-based depots.</li>
        </ul>

        <h2 class="mkt-h2">Citations</h2>
        <ul class="mkt-ul">
          <li>Urva S, et al. "Effects of renal impairment on the pharmacokinetics of the dual GIP and GLP-1 receptor agonist tirzepatide." <em>Clinical Pharmacokinetics</em> (2021). Tirzepatide t½ ≈ 5 days.</li>
          <li>Lau J, et al. "Discovery of the Once-Weekly Glucagon-Like Peptide-1 (GLP-1) Analogue Semaglutide." <em>Journal of Medicinal Chemistry</em> (2015). Semaglutide t½ ≈ 7 days.</li>
          <li>Agersø H, et al. "The pharmacokinetics, pharmacodynamics, safety and tolerability of NN2211, a new long-acting GLP-1 derivative." <em>Diabetologia</em> (2002). Liraglutide t½ ≈ 13 hours.</li>
          <li>Barrington P, et al. "Dulaglutide pharmacokinetics and pharmacodynamics." <em>Diabetes, Obesity and Metabolism</em> (2011). Dulaglutide t½ ≈ 5 days.</li>
        </ul>

        <div class="mkt-callout">
          Protokol Lab is an organizational and mathematical modeling tool.
          It is not a medical device and does not provide medical advice,
          diagnosis, treatment, or dosing recommendations. Pharmacokinetic
          curves are mathematical estimates for informational purposes only
          and do not reflect real-time biological or serum diagnostics.
          Consult a licensed medical professional before making any decision
          about your medication or health.
        </div>

        <div class="mkt-cta-row">
          <button class="mkt-btn-primary" :disabled="demoStarting" @click="tryDemo">
            {{ demoStarting ? 'Loading…' : 'Try the demo →' }}
          </button>
          <a href="/register" class="mkt-btn-secondary">Sign up free</a>
        </div>
      </div>
    </section>
  </MarketingLayout>
</template>
