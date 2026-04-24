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
        <div class="mkt-eyebrow">Medical Advisory</div>
        <h1 class="mkt-h1">Disclaimer,<br /><span class="accent">references, sources.</span></h1>

        <div class="mkt-callout">
          Protokol Lab is an organizational and mathematical modeling tool. It
          does not provide medical advice, diagnose conditions, or recommend
          the consumption of any substance. It is not a medical device under
          FDA regulation and is not a covered entity under HIPAA. Consult a
          licensed medical professional before making any decisions about your
          medication or health.
        </div>

        <h2 class="mkt-h2">Pharmacokinetic defaults</h2>
        <p class="mkt-p">
          Built-in compound half-lives reflect published peer-reviewed
          pharmacokinetic data. Users may override each half-life to match
          individual metabolism, compounded formulations, or clinical
          measurements.
        </p>
        <table class="mkt-table">
          <thead><tr><th>Compound</th><th>Default t½</th><th>Source</th></tr></thead>
          <tbody>
            <tr><td>Tirzepatide</td><td>~5 days</td><td>Urva S, et al. <em>Clinical Pharmacokinetics</em> (2021)</td></tr>
            <tr><td>Semaglutide</td><td>~7 days</td><td>Lau J, et al. <em>Journal of Medicinal Chemistry</em> (2015)</td></tr>
            <tr><td>Liraglutide</td><td>~13 hours</td><td>Agersø H, et al. <em>Diabetologia</em> (2002)</td></tr>
            <tr><td>Dulaglutide</td><td>~5 days</td><td>Barrington P, et al. <em>Diabetes, Obesity and Metabolism</em> (2011)</td></tr>
            <tr><td>Retatrutide</td><td>~6 days</td><td>Jastreboff AM, et al. <em>NEJM</em> (2023)</td></tr>
            <tr><td>Cagrilintide</td><td>~7 days</td><td>Enebo LB, et al. <em>The Lancet</em> (2021)</td></tr>
          </tbody>
        </table>

        <h2 class="mkt-h2">Modeling approach</h2>
        <p class="mkt-p">
          Doses are modeled using the Bateman equation (two-compartment PK
          with first-order absorption and first-order elimination):
        </p>
        <div class="mkt-callout">
          <code>C(t) = D · (k<sub>a</sub> / (k<sub>a</sub> − k<sub>e</sub>)) · (e<sup>−k<sub>e</sub>t</sup> − e<sup>−k<sub>a</sub>t</sup>)</code>
        </div>
        <p class="mkt-p">
          where D = dose, k<sub>a</sub> = absorption rate, k<sub>e</sub> =
          elimination rate (ln(2) / t½). Stacked doses are summed linearly —
          a reasonable approximation below receptor saturation.
        </p>

        <h2 class="mkt-h2">Limitations</h2>
        <ul class="mkt-ul">
          <li>Individual PK varies with weight, renal function, and genetics. Population averages may not match personal kinetics.</li>
          <li>Active-level curves are mathematical — they do not account for receptor desensitization, antibody response, or dose-dependent clearance.</li>
          <li>Symptom correlations are observational, not causal.</li>
          <li>Calorie and macro data depend on user-provided food entries. Brand-name nutrition databases update faster than our library; verify totals if precision matters clinically.</li>
        </ul>

        <h2 class="mkt-h2">Privacy and data handling</h2>
        <p class="mkt-p">
          Protokol Lab stores health data in encrypted form on our servers
          when cloud sync is enabled. Data is never sold, never used for ad
          targeting, and never shared with third parties. Users can export
          their complete history as JSON or CSV at any time and delete their
          account and data permanently from Settings.
        </p>

        <h2 class="mkt-h2">Contact</h2>
        <p class="mkt-p">
          Medical questions, source corrections, or research collaborations:
          <a href="mailto:medical@protokollab.com">medical@protokollab.com</a>.
        </p>
      </div>
    </section>
  </MarketingLayout>
</template>
