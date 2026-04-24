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
          does not provide medical advice, diagnose conditions, prescribe
          treatment, recommend doses, suggest titration schedules, or endorse
          the consumption of any substance. It is not a medical device under
          FDA regulation and is not a covered entity under HIPAA. Consult a
          licensed medical professional before making any decision about your
          medication or health.
        </div>

        <h2 class="mkt-h2">Scope of the product</h2>
        <p class="mkt-p">
          Protokol Lab is a tracker. It helps users record food, weight,
          doses, symptoms, and notes, and visualizes those records. It does
          not substitute for professional medical advice, consultation,
          diagnosis, or treatment. Users assume full and unmitigated
          responsibility for their individual dosing decisions and schedule
          adherence.
        </p>
        <p class="mkt-p">
          Protokol Lab does not sell, ship, distribute, refer users to, or
          endorse any pharmacy, telehealth provider, compounding facility, or
          substance.
        </p>

        <h2 class="mkt-h2">Pharmacokinetic defaults</h2>
        <p class="mkt-p">
          Built-in compound half-lives are provided only for FDA-approved
          GLP-1 receptor agonists and reflect published peer-reviewed data.
          Protokol Lab does not publish pharmacokinetic defaults for compounds
          that are not FDA-approved. Users who choose to track other
          substances must supply their own half-life values and assume full
          responsibility for the accuracy of those values and for the
          legality of any substance they choose to track.
        </p>
        <table class="mkt-table">
          <thead><tr><th>Compound</th><th>Default t½</th><th>Source</th></tr></thead>
          <tbody>
            <tr><td>Tirzepatide</td><td>~5 days</td><td>Urva S, et al. <em>Clinical Pharmacokinetics</em> (2021)</td></tr>
            <tr><td>Semaglutide</td><td>~7 days</td><td>Lau J, et al. <em>Journal of Medicinal Chemistry</em> (2015)</td></tr>
            <tr><td>Liraglutide</td><td>~13 hours</td><td>Agersø H, et al. <em>Diabetologia</em> (2002)</td></tr>
            <tr><td>Dulaglutide</td><td>~5 days</td><td>Barrington P, et al. <em>Diabetes, Obesity and Metabolism</em> (2011)</td></tr>
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
        <p class="mkt-p">
          Pharmacokinetic charts are mathematical estimates for informational
          purposes only and do not reflect real-time biological or serum
          diagnostics.
        </p>

        <h2 class="mkt-h2">Limitations</h2>
        <ul class="mkt-ul">
          <li>Individual pharmacokinetics vary with weight, renal function, and genetics. Population averages may not match personal kinetics.</li>
          <li>Active-level curves are mathematical estimates — they do not account for receptor desensitization, antibody response, or dose-dependent clearance.</li>
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
