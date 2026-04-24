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
        <div class="mkt-eyebrow">About</div>
        <h1 class="mkt-h1">Built by GLP-1 users<br /><span class="accent">for GLP-1 users.</span></h1>

        <p class="mkt-lead">
          Protokol Lab exists because generic calorie counters — MyFitnessPal,
          Cronometer, Lose It — don't understand what it's like to be on a
          GLP-1. They treat every day as independent. They have no concept of
          dose timing, pharmacokinetic half-lives, or the weekly appetite
          pattern that defines life on tirzepatide or semaglutide.
        </p>

        <h2 class="mkt-h2">What we're building</h2>
        <p class="mkt-p">
          A tracker that matches the physiology. Doses are modeled with the
          Bateman equation. Calorie budgets roll over 7-day windows. Symptoms
          get 3-second entry and later correlate against dose curves. The AI
          reads all of it at once and writes back into your log when you ask.
        </p>

        <h2 class="mkt-h2">What we're not</h2>
        <ul class="mkt-ul">
          <li>We are not a telehealth provider. We do not prescribe or ship medication.</li>
          <li>We are not a medical device. Protokol Lab is a modeling and organization tool.</li>
          <li>We do not endorse compounded peptides or research compounds. We support tracking them because users asked.</li>
          <li>We do not sell your health data. We never will.</li>
        </ul>

        <h2 class="mkt-h2">How we make money</h2>
        <p class="mkt-p">
          Subscriptions. Free tier is genuinely free and covers the full core
          tracker. Premium ($9.99/mo or $79/yr) unlocks the AI, correlation
          charts, and unlimited custom compounds. Unlimited ($19.99/mo or
          $149/yr) uncaps AI usage. No ads. No data sales.
        </p>

        <h2 class="mkt-h2">Contact</h2>
        <p class="mkt-p">
          Support and feedback: <a href="mailto:support@protokollab.com">support@protokollab.com</a>.
          Medical advisory board disclosures: <a href="/medical-advisory">/medical-advisory</a>.
        </p>
      </div>
    </section>
  </MarketingLayout>
</template>
