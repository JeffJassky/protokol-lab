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
          Protokol Lab exists because generic calorie counters don't
          understand what life on a GLP-1 actually looks like. They treat
          every day as independent. They have no concept of dose timing, of
          pharmacokinetic half-lives, or of the weekly appetite pattern that
          defines life on tirzepatide or semaglutide. We built the tracker
          we wanted.
        </p>

        <h2 class="mkt-h2">Why this tracker exists</h2>
        <p class="mkt-p">
          A 24-hour calorie target assumes roughly consistent daily appetite.
          GLP-1 medications break that assumption. Appetite suppression peaks
          in the first 48–72 hours after a weekly injection, then fades as
          the drug's serum level drops. Traditional trackers flag low-appetite
          days as "under goal" and rebound days as overage — turning normal
          GLP-1 physiology into perceived failure. Protokol Lab is built
          around that cycle from the first principle: weekly rolling budgets,
          not midnight resets; pharmacokinetic curves, not static numbers.
        </p>

        <h2 class="mkt-h2">What we do</h2>
        <ul class="mkt-ul">
          <li>Model every dose with the Bateman equation so users see the active level in their system in real time, not just the injection schedule.</li>
          <li>Treat calories as a 7-day budget that rolls forward, so a low-appetite day after the shot feeds capacity into the days when appetite returns.</li>
          <li>Track symptoms on a 0–10 severity scale with correlation against the dose curve, so nausea and side effects become predictable patterns rather than random bad luck.</li>
          <li>Ship an agentic AI that reads your full log — food, dose, weight, symptoms — and writes entries for you from plain-English descriptions.</li>
        </ul>

        <h2 class="mkt-h2">What we're not</h2>
        <ul class="mkt-ul">
          <li>We are not a telehealth provider. We do not prescribe, sell, ship, or refer users to pharmacies or compounding facilities for any medication or substance.</li>
          <li>We are not a medical device. Protokol Lab is an organizational and mathematical modeling tool. It does not diagnose, treat, or recommend doses.</li>
          <li>We do not publish pharmacokinetic defaults for anything that is not FDA-approved. Users who track custom compounds supply their own values.</li>
          <li>We do not sell, share, or monetize user health data. We never will.</li>
        </ul>

        <h2 class="mkt-h2">How we stay funded</h2>
        <p class="mkt-p">
          Subscriptions, nothing else. The Free tier is genuinely free and
          covers the full core tracker — dose curves, weight, symptoms,
          basic food logging, progress photos. Premium ($9.99/month or
          $79/year) unlocks the AI coach, correlation charts, rolling weekly
          targets, unlimited custom compounds, cloud sync, and data export.
          Unlimited ($19.99/month or $149/year) raises AI caps for heavy
          users. No ads. No data sales. Cancel anytime.
        </p>

        <h2 class="mkt-h2">Our commitments</h2>
        <ul class="mkt-ul">
          <li><strong>Your data is yours.</strong> Full JSON/CSV export, always free, no support ticket required. Delete your account and everything goes with it.</li>
          <li><strong>No data sales.</strong> We do not sell, share, or license user health data to third parties.</li>
          <li><strong>Offline-first.</strong> The core tracker works without an internet connection. Cloud sync is opt-in.</li>
          <li><strong>Honest comparisons.</strong> Our <a href="/compare">comparison pages</a> lead with what competitors do well. We link to their homepages. No attack copy.</li>
          <li><strong>No dark patterns.</strong> Trial cancellation is one click from Settings. Downgrade takes effect at the end of the current billing period. Renewals are email-notified.</li>
        </ul>

        <h2 class="mkt-h2">Contact</h2>
        <ul class="mkt-ul">
          <li>General support and feedback: <a href="mailto:support@protokollab.com">support@protokollab.com</a></li>
          <li>Medical questions, source corrections, or research collaborations: <a href="mailto:medical@protokollab.com">medical@protokollab.com</a></li>
          <li>Privacy inquiries or data requests: <a href="mailto:privacy@protokollab.com">privacy@protokollab.com</a></li>
        </ul>

        <p class="mkt-p">
          See also: <a href="/terms">Terms of Service</a> ·
          <a href="/privacy">Privacy Policy</a> ·
          <a href="/medical-advisory">Medical Advisory</a>
        </p>
      </div>
    </section>
  </MarketingLayout>
</template>
